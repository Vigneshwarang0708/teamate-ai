import logging
import os
import struct
import time
from typing import Any
from dotenv import load_dotenv
import httpx

logger = logging.getLogger("teammate.prisma")

# Official Gnani Vachana / Prisma STT endpoint
DEFAULT_PRISMA_URL = "https://api.vachana.ai/stt/v3"

LANGUAGE_CODE_MAP = {
    "ta": "ta-IN",
    "tamil": "ta-IN",
    "tanglish": "ta-IN,en-IN",  # Multi-language code-mixing supported by Prisma v3.0
    "hi": "hi-IN",
    "hindi": "hi-IN",
    "en": "en-IN",
    "english": "en-IN",
    "auto": "indic-auto",
}


def get_prisma_config() -> tuple[str, str]:
    load_dotenv()
    api_key = os.getenv("GNANI_API_KEY", "").strip()
    endpoint = os.getenv("GNANI_PRISMA_URL", DEFAULT_PRISMA_URL).strip() or DEFAULT_PRISMA_URL
    return api_key, endpoint


def detect_audio_metadata(audio_bytes: bytes) -> dict[str, Any]:
    """Inspects audio magic bytes and header without third-party dependencies."""
    meta = {
        "format": "unknown",
        "mime_type": "audio/wav",
        "sample_rate": None,
        "channels": None,
    }

    if len(audio_bytes) < 12:
        return meta

    # RIFF WAV
    if audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
        meta["format"] = "wav"
        meta["mime_type"] = "audio/wav"
        if len(audio_bytes) >= 36:
            try:
                channels = struct.unpack("<H", audio_bytes[22:24])[0]
                sample_rate = struct.unpack("<I", audio_bytes[24:28])[0]
                meta["channels"] = channels
                meta["sample_rate"] = sample_rate
            except Exception:
                pass
    # EBML / WebM
    elif audio_bytes[:4] == b"\x1a\x45\xdf\xa3":
        meta["format"] = "webm"
        meta["mime_type"] = "audio/webm"
    # Ogg
    elif audio_bytes[:4] == b"OggS":
        meta["format"] = "ogg"
        meta["mime_type"] = "audio/ogg"
    # MP3 ID3
    elif audio_bytes[:3] == b"ID3" or audio_bytes[:2] in (b"\xff\xfb", b"\xff\xf3"):
        meta["format"] = "mp3"
        meta["mime_type"] = "audio/mp3"

    return meta


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.wav",
    content_type: str = "audio/wav",
    language: str = "ta",
) -> dict[str, Any]:
    """Transcribes audio using official Gnani Prisma Speech-to-Text API.
    
    Uses official endpoint https://api.vachana.ai/stt/v3 with X-API-Key-ID authentication.
    Strictly verifies language codes, format parameters, and audio metadata.
    """
    api_key, endpoint = get_prisma_config()

    if not api_key:
        logger.warning("GNANI_API_KEY is not configured in backend/.env")
        return {
            "success": False,
            "transcript": "",
            "language": language,
            "mode": "unconfigured",
            "message": "GNANI_API_KEY is not configured. Please add your key in backend/.env.",
        }

    lang_lower = language.lower().strip() if language else "ta"
    lang_code = LANGUAGE_CODE_MAP.get(lang_lower, "ta-IN")

    # Format parameter:
    # "codemix" preserves English brand/product words in Tamil speech (e.g. "Furniture shop", "tea", "account-la")
    # "transcribe" applies standard Inverse Text Normalization
    stt_format = "codemix" if lang_lower in ("tanglish", "ta", "tamil") else "transcribe"

    # Inspect audio magic bytes to guarantee valid MIME type and filename
    audio_meta = detect_audio_metadata(audio_bytes)
    detected_mime = audio_meta["mime_type"]
    ext = audio_meta["format"] if audio_meta["format"] != "unknown" else "wav"
    upload_filename = f"speech.{ext}"

    logger.info(
        "Prisma STT request: lang_code=%s, format=%s, size=%d bytes, detected_fmt=%s, sr=%s, channels=%s",
        lang_code,
        stt_format,
        len(audio_bytes),
        audio_meta["format"],
        audio_meta["sample_rate"],
        audio_meta["channels"],
    )

    headers = {
        "X-API-Key-ID": api_key,
    }

    files = {
        "audio_file": (upload_filename, audio_bytes, detected_mime),
    }

    data = {
        "model": "prisma-v3.0",
        "language_code": lang_code,
        "format": stt_format,
    }

    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                endpoint,
                headers=headers,
                files=files,
                data=data,
            )

            latency = round(time.time() - start_time, 3)

            if response.status_code == 200:
                result = response.json()
                transcript = (
                    result.get("transcript")
                    or result.get("text")
                    or (result.get("data") or {}).get("transcript")
                    or (result.get("result") or {}).get("transcript")
                    or ""
                ).strip()

                logger.info(
                    "Prisma STT success in %ss: transcript_len=%d, detected_lang=%s",
                    latency,
                    len(transcript),
                    result.get("detected_language_code", lang_code),
                )

                return {
                    "success": True,
                    "transcript": transcript,
                    "language": language,
                    "mode": "gnani_prisma",
                    "latency": latency,
                    "detected_language_code": result.get("detected_language_code", lang_code),
                    "raw_response": result,
                }
            else:
                error_detail = response.text[:300]
                try:
                    res_json = response.json()
                    error_detail = (
                        res_json.get("error", {}).get("message")
                        or res_json.get("message")
                        or error_detail
                    )
                except Exception:
                    pass

                logger.warning("Prisma STT error HTTP %s in %ss: %s", response.status_code, latency, error_detail)

                return {
                    "success": False,
                    "transcript": "",
                    "language": language,
                    "mode": "gnani_prisma_error",
                    "status_code": response.status_code,
                    "message": f"Gnani Prisma returned HTTP {response.status_code}: {error_detail}",
                    "latency": latency,
                }
    except Exception as exc:
        latency = round(time.time() - start_time, 3)
        logger.error("Exception calling Gnani Prisma: %s (latency=%ss)", exc, latency)
        return {
            "success": False,
            "transcript": "",
            "language": language,
            "mode": "network_error",
            "message": f"Connection to Gnani Prisma STT failed: {str(exc)}",
            "latency": latency,
        }
