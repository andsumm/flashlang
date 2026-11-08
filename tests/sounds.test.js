import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundFeedback } from '../src/sounds.js';

function audioEnvironment({saved = null, suspended = false} = {}) {
  const storage = new Map(saved ? [['flashlang.sound', saved]] : []);
  const oscillators = [], resumes = [];
  let contexts = 0;
  const env = {
    document: {visibilityState: 'visible'},
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    AudioContext: class {
      constructor() { contexts++; this.state = suspended ? 'suspended' : 'running'; this.currentTime = 0; }
      resume() { return new Promise(resolve => resumes.push(resolve)); }
      createOscillator() {
        const oscillator = {
          frequency: {setValueAtTime() {}}, connect() {}, start() { this.started = true; },
          stop() { this.stops = (this.stops || 0) + 1; }, disconnect() { this.disconnected = true; },
        };
        oscillators.push(oscillator);
        return oscillator;
      }
      createGain() {
        return {gain: {setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}, disconnect() {}};
      }
    },
  };
  return {env, storage, oscillators, resumes, get contexts() { return contexts; }};
}

test('audio stays lazy and the device mute choice survives a new controller', () => {
  const fixture = audioEnvironment();
  const sounds = createSoundFeedback(fixture.env);
  assert.equal(sounds.enabled, true);
  assert.equal(fixture.contexts, 0);
  sounds.setEnabled(false);
  sounds.play('complete');
  assert.equal(fixture.contexts, 0);
  const restored = createSoundFeedback(fixture.env);
  assert.equal(restored.enabled, false);
  restored.setEnabled(true);
  restored.play('tap');
  assert.equal(fixture.contexts, 1);
  assert.equal(fixture.oscillators[0].started, true);
});

test('muting cuts off a playing cue, including its future notes', () => {
  const fixture = audioEnvironment();
  const sounds = createSoundFeedback(fixture.env);
  sounds.play('complete');
  assert.ok(fixture.oscillators.length > 1);
  sounds.setEnabled(false);
  assert.ok(fixture.oscillators.every(voice => voice.disconnected && voice.stops === 2));
  const count = fixture.oscillators.length;
  sounds.play('reveal');
  assert.equal(fixture.oscillators.length, count);
});

test('a pending browser audio resume cannot play after muting', async () => {
  const fixture = audioEnvironment({suspended: true});
  const sounds = createSoundFeedback(fixture.env);
  sounds.play('complete');
  sounds.setEnabled(false);
  fixture.resumes.forEach(resolve => resolve());
  await Promise.resolve();
  assert.equal(fixture.oscillators.length, 0);
});

test('newer feedback replaces stale cues waiting for audio permission', async () => {
  const fixture = audioEnvironment({suspended: true});
  const sounds = createSoundFeedback(fixture.env);
  sounds.play('complete');
  sounds.play('tap');
  fixture.resumes.forEach(resolve => resolve());
  await Promise.resolve();
  assert.equal(fixture.oscillators.length, 1);
});

test('background pages and initial page loads do not start audio', () => {
  const fixture = audioEnvironment();
  const sounds = createSoundFeedback(fixture.env);
  fixture.env.document.visibilityState = 'hidden';
  sounds.play('success');
  fixture.env.document.visibilityState = 'visible';
  fixture.env.navigator = {userActivation: {hasBeenActive: false}};
  sounds.play('error');
  assert.equal(fixture.contexts, 0);
});

test('unavailable audio, blocked resume, and unavailable storage are harmless', async () => {
  const env = {
    get localStorage() { throw new Error('Storage unavailable'); },
  };
  const sounds = createSoundFeedback(env);
  assert.doesNotThrow(() => { sounds.setEnabled(false); sounds.setEnabled(true); sounds.play(); });
  env.AudioContext = class { constructor() { throw new Error('Audio blocked'); } };
  assert.doesNotThrow(() => sounds.play());
  env.AudioContext = class {
    state = 'suspended';
    resume() { return Promise.reject(new Error('Autoplay blocked')); }
  };
  assert.doesNotThrow(() => sounds.play());
  await Promise.resolve();
});
