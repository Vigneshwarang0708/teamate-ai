// Helper for speech synthesis (TTS) and voice recognition (STT)

export const playAudio = (base64Audio?: string | null, fallbackText?: string, language: string = "en") => {
  if (base64Audio) {
    try {
      const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
      audio.play().catch((err) => {
        console.warn("Base64 audio playback failed, falling back to speech synthesis:", err);
        speakWithBrowser(fallbackText, language);
      });
      return;
    } catch (e) {
      console.warn("Audio element error:", e);
    }
  }

  if (fallbackText) {
    speakWithBrowser(fallbackText, language);
  }
};

export const speakWithBrowser = (text?: string, language: string = "en") => {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    const langLower = language.toLowerCase();

    if (langLower.includes("tamil") || langLower === "ta") {
      utterance.lang = "ta-IN";
    } else if (langLower.includes("hindi") || langLower === "hi") {
      utterance.lang = "hi-IN";
    } else {
      utterance.lang = "en-IN";
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick matching voice if available
    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(
      (v) => v.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase())
    );
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Speech synthesis error:", err);
  }
};

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number = 16000): Float32Array {
  if (outputRate === inputRate) {
    return buffer;
  }
  if (outputRate > inputRate) {
    return buffer;
  }
  const sampleRateRatio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, "RIFF");
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, "WAVE");
  /* format chunk identifier */
  writeString(view, 12, "fmt ");
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count: mono (1) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, "data");
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit linear PCM with soft clipping
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export const createAudioRecorder = () => {
  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let audioChunks: Float32Array[] = [];

  const start = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStream = stream;
      audioChunks = [];

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContext = new AudioCtxClass();

      sourceNode = audioContext.createMediaStreamSource(stream);
      // Buffer size 4096 gives smooth captures with low latency
      processorNode = audioContext.createScriptProcessor(4096, 1, 1);

      processorNode.onaudioprocess = (evt) => {
        const inputData = evt.inputBuffer.getChannelData(0);
        audioChunks.push(new Float32Array(inputData));
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);

      return true;
    } catch (error) {
      console.error("Microphone access denied or error:", error);
      return false;
    }
  };

  const stop = async (): Promise<Blob> => {
    try {
      if (processorNode && sourceNode) {
        sourceNode.disconnect();
        processorNode.disconnect();
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }

      const inputSampleRate = audioContext?.sampleRate || 44100;
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close();
      }

      if (audioChunks.length === 0) {
        return new Blob([], { type: "audio/wav" });
      }

      // Calculate total length
      const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const mergedSamples = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        mergedSamples.set(chunk, offset);
        offset += chunk.length;
      }

      // Target 16kHz for speech recognition (optimal for Gnani Prisma STT)
      const targetSampleRate = 16000;
      const downsampledSamples = downsampleBuffer(mergedSamples, inputSampleRate, targetSampleRate);

      return encodeWav(downsampledSamples, targetSampleRate);
    } catch (err) {
      console.error("Failed to process recorded audio:", err);
      return new Blob([], { type: "audio/wav" });
    }
  };

  return { start, stop };
};

