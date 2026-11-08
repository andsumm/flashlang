import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrainscapePackUrl } from '../src/brainscape.js';

test('accepts a public Brainscape pack link and removes tracking data', () => {
  assert.equal(
    normalizeBrainscapePackUrl('https://www.brainscape.com/flashcards/011-common-greetings-14150191/packs/21648778?source=share#cards'),
    'https://www.brainscape.com/flashcards/011-common-greetings-14150191/packs/21648778',
  );
});

test('rejects non-Brainscape, non-HTTPS, and non-pack URLs', () => {
  for (const url of [
    'https://example.com/flashcards/example-123/packs/456',
    'http://www.brainscape.com/flashcards/example-123/packs/456',
    'https://www.brainscape.com/learn/spanish',
    'https://www.brainscape.com.evil.example/flashcards/example-123/packs/456',
    'https://user@www.brainscape.com/flashcards/example-123/packs/456',
  ]) {
    assert.throws(() => normalizeBrainscapePackUrl(url), /Brainscape pack URL|public Brainscape/);
  }
});
