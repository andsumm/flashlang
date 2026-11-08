export function createSpeechController(env = globalThis, {onError = () => {}} = {}) {
  let activeUtterance = null;

  function preferredVoice(language) {
    const voices = typeof env.speechSynthesis?.getVoices === 'function'
      ? env.speechSynthesis.getVoices()
      : [];
    const target = String(language || '').toLowerCase().replace(/_/g, '-');
    const baseLanguage = target.split('-')[0];
    const matching = voices.filter(voice => {
      const voiceLanguage = String(voice.lang || '').toLowerCase().replace(/_/g, '-');
      return voiceLanguage === target || voiceLanguage.split('-')[0] === baseLanguage;
    });
    const exact = matching.filter(voice => String(voice.lang || '').toLowerCase().replace(/_/g, '-') === target);
    const candidates = exact.length ? exact : matching;
    return candidates.reduce((best, voice) => {
      const name = String(voice.name || '');
      const score = (/\b(natural|neural|premium|enhanced)\b/i.test(name) ? 4 : 0)
        + (/\b(google|siri)\b/i.test(name) ? 2 : 0)
        + (voice.localService === false ? 1 : 0)
        + (voice.default ? 0.5 : 0);
      return !best || score > best.score ? {voice, score} : best;
    }, null)?.voice;
  }

  function stop() {
    if (!activeUtterance) return;
    activeUtterance = null;
    env.speechSynthesis.cancel();
  }

  function speak(text, language) {
    if (typeof text !== 'string' || !text.trim()
      || typeof env.SpeechSynthesisUtterance !== 'function'
      || typeof env.speechSynthesis?.speak !== 'function'
      || typeof env.speechSynthesis.cancel !== 'function') return false;
    stop();
    const utterance = new env.SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const voice = preferredVoice(language);
    if (voice) utterance.voice = voice;
    utterance.onend = () => { if (activeUtterance === utterance) activeUtterance = null; };
    utterance.onerror = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      onError();
    };
    activeUtterance = utterance;
    env.speechSynthesis.speak(utterance);
    return true;
  }

  return {speak, stop};
}
