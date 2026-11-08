// Small, soft cues generated locally, including when the app is offline.
const STORAGE_KEY = 'flashlang.sound';
const cues = {
  tap: [[440, 0, .065, .025]],
  start: [[392, 0, .12, .045], [587.33, .08, .17, .04]],
  reveal: [[523.25, 0, .09, .035], [659.25, .045, .13, .025]],
  rate: [[587.33, 0, .12, .04]],
  complete: [[523.25, 0, .18, .045], [659.25, .12, .18, .04], [783.99, .24, .3, .04]],
  success: [[523.25, 0, .1, .035], [783.99, .07, .17, .035]],
  error: [[293.66, 0, .13, .035], [261.63, .1, .16, .03]],
};

export function createSoundFeedback(env = globalThis) {
  let enabled = true, context, generation = 0;
  const voices = new Set();
  try { enabled = env.localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { /* Keep the in-memory preference. */ }

  function stop() {
    generation++;
    for (const voice of voices) {
      try { voice.oscillator.stop(); } catch { /* The voice may have already ended. */ }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) stop();
    try { env.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* Sound controls still work without storage. */ }
  }

  function play(name = 'tap') {
    if (!enabled || env.document?.visibilityState === 'hidden' || env.navigator?.userActivation?.hasBeenActive === false || !cues[name]) return;
    try {
      const AudioContext = env.AudioContext || env.webkitAudioContext;
      if (!AudioContext) return;
      // Creating/resuming from the interaction keeps mobile autoplay rules intact.
      if (!context || context.state === 'closed') context = new AudioContext();
      stop();
      const request = generation;
      const schedule = () => {
        if (!enabled || request !== generation || env.document?.visibilityState === 'hidden') return;
        try {
          const now = context.currentTime;
          for (const [frequency, delay, duration, volume] of cues[name]) {
            const oscillator = context.createOscillator(), gain = context.createGain();
            const start = now + delay;
            const voice = {oscillator, gain};
            voices.add(voice);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + .008);
            gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.onended = () => {
              oscillator.disconnect();gain.disconnect();voices.delete(voice);
            };
            oscillator.start(start);
            oscillator.stop(start + duration + .01);
          }
        } catch { stop(); /* Audio failure must never interrupt studying. */ }
      };
      if (context.state === 'running') schedule();
      else context.resume().then(schedule).catch(() => {});
    } catch { /* Unsupported or blocked audio leaves the rest of the app working. */ }
  }

  return {get enabled() { return enabled; }, setEnabled, play, stop};
}
