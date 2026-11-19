const ENVELOPE_SAMPLES = 512;
const GATE_CLOSE_LEVEL = 0.012;
const GATE_OPEN_LEVEL = 0.03;
const HOLD_CLOSE_MS = 220;
const HOLD_OPEN_MS = 80;

/** RMS of an 8-bit unsigned PCM frame, normalised to 0..1. */
export function rmsLevel(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = (samples[index] - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Gates a microphone track so a quiet room is actually silent instead of a
 * constant hiss that the browser's auto gain control keeps amplifying.
 * Returns null on browsers without Web Audio support; the caller then uses the
 * original track unchanged.
 */
export function createNoiseGate(stream) {
  const sourceTrack = stream?.getAudioTracks?.()?.[0];
  if (!sourceTrack || typeof window === 'undefined') return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  let context;
  try {
    context = new AudioContextClass();
  } catch {
    return null;
  }

  const source = context.createMediaStreamSource(new MediaStream([sourceTrack]));
  const analyser = context.createAnalyser();
  analyser.fftSize = ENVELOPE_SAMPLES;
  const gain = context.createGain();
  gain.gain.value = 1;
  const destination = context.createMediaStreamDestination();

  source.connect(analyser);
  analyser.connect(gain);
  gain.connect(destination);

  const samples = new Uint8Array(analyser.fftSize);
  let frame = null;
  let gated = false;
  let lastChange = 0;

  const tick = () => {
    frame = requestAnimationFrame(tick);
    analyser.getByteTimeDomainData(samples);
    const level = rmsLevel(samples);
    const now = performance.now();

    if (!gated && level < GATE_CLOSE_LEVEL && now - lastChange > HOLD_CLOSE_MS) {
      gain.gain.value = 0;
      gated = true;
      lastChange = now;
    } else if (gated && level > GATE_OPEN_LEVEL && now - lastChange > HOLD_OPEN_MS) {
      gain.gain.value = 1;
      gated = false;
      lastChange = now;
    }
  };

  context.resume?.().catch(() => {});
  frame = requestAnimationFrame(tick);

  return {
    track: destination.stream.getAudioTracks()[0] ?? sourceTrack,
    cleanup: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      try {
        source.disconnect();
        analyser.disconnect();
        gain.disconnect();
      } catch {
        // Already disconnected nodes are harmless.
      }
      context.close?.().catch(() => {});
    },
  };
}
