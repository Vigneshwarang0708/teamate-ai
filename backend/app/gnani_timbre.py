import base64
import io
import logging
import os
import time
from typing import Any
import wave
from dotenv import load_dotenv
import httpx

logger = logging.getLogger("teammate.timbre")

# Official Gnani Vachana / Timbre TTS endpoint
DEFAULT_TIMBRE_URL = "https://api.vachana.ai/api/v1/tts/inference"

# =============================================================================
# MODEL & VOICE CONFIGURATION
#
# Verified via live API testing (2026-11-07):
#   - timbre-v2.5: Supports Tamil voices Brinda, Asmita, Trisha, Vedika.
#     Returns raw 16-bit signed linear PCM at 48,000 Hz (no RIFF header).
#   - timbre-v3.0: Does NOT support Brinda/Asmita/Trisha/Vedika.
#     Supports en-IN voices: Shivani, Lakshmi, Kalpana, Anand, etc.
#
# CRITICAL: timbre-v2.5 always returns raw PCM at 48000 Hz regardless of
# the sample_rate or container fields in the request. The WAV wrapper MUST
# use 48000 Hz or playback will be severely pitch-shifted and slow.
# =============================================================================

# Tamil voices (timbre-v2.5 only)
TAMIL_VOICES = ["Brinda", "Asmita", "Trisha", "Vedika"]

# English/Hindi voices (timbre-v3.0)
ENGLISH_VOICES_V3 = ["Shivani", "Lakshmi", "Kalpana", "Anand", "Avinash"]

# Language → (model, language_code, default_voice)
LANG_TTS_CONFIG = {
    "ta":       ("timbre-v2.5", "ta",    "Brinda"),
    "tamil":    ("timbre-v2.5", "ta",    "Brinda"),
    "tanglish": ("timbre-v2.5", "ta",    "Brinda"),
    "hi":       ("timbre-v3.0", "hi-IN", "Shivani"),
    "hindi":    ("timbre-v3.0", "hi-IN", "Shivani"),
    "en":       ("timbre-v3.0", "en-IN", "Shivani"),
    "english":  ("timbre-v3.0", "en-IN", "Shivani"),
    "auto":     ("timbre-v3.0", "en-IN", "Shivani"),
}

# PCM sample rate returned by timbre-v2.5 (verified experimentally)
TIMBRE_V25_SAMPLE_RATE = 48000
# PCM sample rate for timbre-v3.0 (also verified as 48000 Hz)
TIMBRE_V30_SAMPLE_RATE = 48000


def get_timbre_config() -> tuple[str, str]:
    load_dotenv()
    api_key = os.getenv("GNANI_API_KEY", "").strip()
    endpoint = os.getenv("GNANI_TIMBRE_URL", DEFAULT_TIMBRE_URL).strip() or DEFAULT_TIMBRE_URL
    return api_key, endpoint


def get_tts_voice_preference() -> str:
    """Read user-selected Tamil voice from env (set via Settings page)."""
    return os.getenv("GNANI_TIMBRE_TAMIL_VOICE", "Brinda").strip()


def wrap_pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 48000, channels: int = 1, sampwidth: int = 2) -> bytes:
    """Wraps raw linear PCM audio into a standard RIFF WAV file for browser playback.
    
    IMPORTANT: sample_rate must match the actual PCM output rate from the TTS API,
    NOT the requested rate. Mismatch causes pitch shift and speed distortion.
    timbre-v2.5 always outputs at 48000 Hz regardless of request parameters.
    """
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(sampwidth)
        w.setframerate(sample_rate)
        w.writeframes(pcm_bytes)
    return buf.getvalue()


# =============================================================================
# NUMBER-TO-WORDS FOR NATURAL SPEECH
# =============================================================================

_TAMIL_ONES = [
    "", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து",
    "ஆறு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து",
    "பதினொன்று", "பன்னிரண்டு", "பதிமூன்று", "பதினான்கு", "பதினைந்து",
    "பதினாறு", "பதினேழு", "பதினெட்டு", "பத்தொன்பது",
]
_TAMIL_TENS = [
    "", "", "இருபது", "முப்பது", "நாற்பது", "ஐம்பது",
    "அறுபது", "எழுபது", "எண்பது", "தொண்ணூறு",
]


def _int_to_tamil_words(n: int) -> str:
    """Converts an integer (0–9999) to Tamil words."""
    if n == 0:
        return "பூஜ்ஜியம்"
    if n < 0:
        return "கழித்தல் " + _int_to_tamil_words(-n)
    parts = []
    if n >= 1000:
        parts.append(_int_to_tamil_words(n // 1000) + " ஆயிரம்")
        n %= 1000
    if n >= 100:
        parts.append(_int_to_tamil_words(n // 100) + " நூறு")
        n %= 100
    if n >= 20:
        tens = _TAMIL_TENS[n // 10]
        ones = _TAMIL_ONES[n % 10]
        parts.append((tens + (" " + ones if ones else "")).strip())
    elif n > 0:
        parts.append(_TAMIL_ONES[n])
    return " ".join(parts)


def amount_to_tamil_words(amount: float | int) -> str:
    """Converts a rupee amount to Tamil words, e.g. 56 → 'ஐம்பத்தாறு'."""
    try:
        amt = int(round(float(amount)))
        return _int_to_tamil_words(amt)
    except Exception:
        return str(amount)


_ENGLISH_ONES = [
    "", "one", "two", "three", "four", "five",
    "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
]
_ENGLISH_TENS = [
    "", "", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety",
]


def _int_to_english_words(n: int) -> str:
    if n == 0:
        return "zero"
    if n < 0:
        return "minus " + _int_to_english_words(-n)
    parts = []
    if n >= 1000:
        parts.append(_int_to_english_words(n // 1000) + " thousand")
        n %= 1000
    if n >= 100:
        parts.append(_int_to_english_words(n // 100) + " hundred")
        n %= 100
    if n >= 20:
        t = _ENGLISH_TENS[n // 10]
        o = _ENGLISH_ONES[n % 10]
        parts.append((t + ("-" + o if o else "")).rstrip("-"))
    elif n > 0:
        parts.append(_ENGLISH_ONES[n])
    return " ".join(parts)


def amount_to_english_words(amount: float | int) -> str:
    try:
        amt = int(round(float(amount)))
        return _int_to_english_words(amt) + " rupees"
    except Exception:
        return str(amount) + " rupees"


# =============================================================================
# MULTILINGUAL CONFIRMATION PHRASE BUILDER
# =============================================================================

def build_confirmation_phrase(
    total: str | int | float,
    payment_type: str,
    customer_name: str | None = None,
    language: str = "en",
    items_summary: str | None = None,
) -> str:
    """Generates natural, clearly-spoken multilingual billing confirmations.
    
    Currency amounts are converted to spoken words for natural TTS output.
    Numbers like ₹56 become 'ஐம்பத்தாறு ரூபாய்' (Tamil) or 'fifty-six rupees' (English).
    """
    lang = language.lower().strip()
    try:
        total_num = float(total)
    except (ValueError, TypeError):
        total_num = 0.0

    # --- Tamil / Tanglish ---
    if lang in ("ta", "tamil", "tanglish"):
        total_words = amount_to_tamil_words(total_num)
        if payment_type == "credit" and customer_name:
            return f"{customer_name} கணக்கில் {total_words} ரூபாய் கடனாக பதிவு செய்யப்பட்டது."
        return f"பில் பதிவு செய்யப்பட்டது. மொத்தம் {total_words} ரூபாய்."

    # --- Hindi ---
    if lang in ("hi", "hindi"):
        try:
            amt_int = int(round(total_num))
        except Exception:
            amt_int = 0
        if payment_type == "credit" and customer_name:
            return f"{customer_name} के खाते में {amt_int} रुपये कर्ज के रूप में दर्ज हो गए हैं।"
        return f"बिल दर्ज हो गया है। कुल {amt_int} रुपये।"

    # --- English (default) ---
    total_words_en = amount_to_english_words(total_num)
    if payment_type == "credit" and customer_name:
        return f"Recorded {total_words_en} to {customer_name}'s credit account."
    return f"Bill saved. Total is {total_words_en}."


# =============================================================================
# MAIN TTS SYNTHESIS FUNCTION
# =============================================================================

async def synthesize_speech(
    text: str,
    language: str = "en",
    voice_override: str | None = None,
) -> dict[str, Any]:
    """Synthesizes speech using official Gnani Timbre Text-to-Speech API.

    Model selection:
      - Tamil / Tanglish: timbre-v2.5 (Brinda/Asmita/Trisha/Vedika)
      - English / Hindi:  timbre-v3.0 (Shivani/Lakshmi/Kalpana)

    timbre-v2.5 always returns raw 16-bit PCM at 48000 Hz (no RIFF header).
    The WAV wrapper MUST use 48000 Hz to prevent pitch/speed distortion.

    Falls back to browser Web Speech API if key not configured or API fails.
    """
    api_key, endpoint = get_timbre_config()

    if not api_key:
        logger.info("GNANI_API_KEY not configured – using browser speech fallback.")
        return {
            "success": True,
            "mode": "browser_fallback",
            "speech_text": text,
            "language": language,
            "audio_base64": None,
            "message": "GNANI_API_KEY not configured. Using browser Web Speech API fallback.",
        }

    lang_key = language.lower().strip()
    model, lang_code, default_voice = LANG_TTS_CONFIG.get(lang_key, ("timbre-v3.0", "en-IN", "Shivani"))

    # Respect user voice preference for Tamil voices
    if model == "timbre-v2.5":
        preferred_voice = voice_override or get_tts_voice_preference()
        voice = preferred_voice if preferred_voice in TAMIL_VOICES else default_voice
    else:
        voice = voice_override or default_voice

    # Speaking speed: 0.92 is natural-sounding without being unnaturally slow
    speed = 0.92

    headers = {
        "X-API-Key-ID": api_key,
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "text": text,
        "voice": voice,
        "language": lang_code,
        "speed": speed,
    }

    logger.info(
        "Timbre TTS request: model=%s, voice=%s, lang=%s, speed=%s, text_len=%d",
        model, voice, lang_code, speed, len(text),
    )

    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(endpoint, headers=headers, json=payload)

        latency = round(time.time() - start, 3)

        if response.status_code == 200:
            raw_bytes = response.content

            # Determine actual PCM sample rate based on model
            # Both models return raw 16-bit signed PCM at 48000 Hz (verified experimentally)
            pcm_sample_rate = TIMBRE_V25_SAMPLE_RATE  # 48000 Hz for both models

            # Wrap raw PCM bytes in a RIFF WAV header at the CORRECT sample rate
            if raw_bytes.startswith(b"RIFF"):
                # Already a valid WAV — play as-is (future-proof)
                wav_bytes = raw_bytes
            else:
                wav_bytes = wrap_pcm_to_wav(raw_bytes, sample_rate=pcm_sample_rate, channels=1, sampwidth=2)

            duration = round(len(raw_bytes) / (2 * pcm_sample_rate), 2)
            audio_b64 = base64.b64encode(wav_bytes).decode("ascii")

            logger.info(
                "Timbre TTS success: model=%s, voice=%s, latency=%ss, pcm_bytes=%d, duration=%ss",
                model, voice, latency, len(raw_bytes), duration,
            )

            return {
                "success": True,
                "mode": "gnani_timbre",
                "model": model,
                "voice": voice,
                "speech_text": text,
                "language": language,
                "audio_base64": audio_b64,
                "duration_seconds": duration,
                "latency_seconds": latency,
            }

        else:
            error_detail = response.text[:300]
            try:
                rj = response.json()
                error_detail = rj.get("message") or rj.get("error", {}).get("message") or error_detail
            except Exception:
                pass

            logger.warning("Timbre TTS HTTP %s in %ss: %s", response.status_code, round(time.time() - start, 3), error_detail)
            return {
                "success": True,
                "mode": "browser_fallback_after_error",
                "speech_text": text,
                "language": language,
                "audio_base64": None,
                "status_code": response.status_code,
                "message": f"Gnani Timbre returned HTTP {response.status_code}: {error_detail}. Using browser voice.",
            }

    except Exception as exc:
        logger.error("Exception calling Gnani Timbre: %s", exc)
        return {
            "success": True,
            "mode": "browser_fallback_after_error",
            "speech_text": text,
            "language": language,
            "audio_base64": None,
            "message": f"Connection error: {str(exc)}. Using browser voice.",
        }
