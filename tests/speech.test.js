import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechController } from '../src/speech.js';

function speechEnvironment(voices = []) {
  const utterances = [];
  let cancellations = 0;
  const env = {
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; utterances.push(this); }
    },
    speechSynthesis: {
      speak(utterance) { utterance.spoken = true; },
      cancel() { cancellations++; },
      getVoices() { return voices; },
    },
  };
  return {env, utterances, get cancellations() { return cancellations; }};
}

test('answers are spoken with the course language and can be stopped or replayed', () => {
  const fixture = speechEnvironment();
  const speech = createSpeechController(fixture.env);
  assert.equal(speech.speak('Buongiorno', 'it-IT'), true);
  assert.equal(fixture.utterances[0].lang, 'it-IT');
  assert.equal(fixture.utterances[0].spoken, true);
  assert.equal(speech.speak('Bonjour', 'fr-FR'), true);
  assert.equal(fixture.cancellations, 1);
  assert.equal(fixture.utterances[1].lang, 'fr-FR');
  speech.stop();
  assert.equal(fixture.cancellations, 2);
});

test('a natural voice for the course language is preferred when the browser provides one', () => {
  const naturalEnglish = {name: 'English Natural', lang: 'en-US', localService: false};
  const fixture = speechEnvironment([
    {name: 'English Voice', lang: 'en-US', localService: true},
    naturalEnglish,
    {name: 'French Natural', lang: 'fr-FR', localService: false},
  ]);
  const speech = createSpeechController(fixture.env);
  speech.speak('Hello', 'en-US');
  assert.equal(fixture.utterances[0].voice, naturalEnglish);
});

test('unsupported speech and empty answers report unavailable without throwing', () => {
  const speech = createSpeechController({});
  assert.equal(speech.speak('Hello', 'en-US'), false);
  assert.equal(speech.speak('  ', 'en-US'), false);
  assert.doesNotThrow(() => speech.stop());
});

test('speech errors reset the active utterance and notify the caller', () => {
  const fixture = speechEnvironment();
  let errors = 0;
  const speech = createSpeechController(fixture.env, {onError: () => errors++});
  speech.speak('Hello', 'en-US');
  fixture.utterances[0].onerror();
  assert.equal(errors, 1);
  speech.stop();
  assert.equal(fixture.cancellations, 0);
});
