import test from 'node:test';
import assert from 'node:assert/strict';
import { translateText } from '../src/i18n.js';

test('Italian translations cover navigation, study controls, and grouped counts', () => {
  assert.equal(translateText('My library', 'it'), 'La mia libreria');
  assert.equal(translateText('Reveal answer', 'it'), 'Rivela la risposta');
  assert.equal(translateText('2,784 cards', 'it'), '2,784 schede');
  assert.equal(translateText('1 review due', 'it'), '1 ripasso in scadenza');
  assert.equal(translateText('2 reviews due', 'it'), '2 ripassi in scadenza');
  assert.equal(translateText('  My progress  ', 'it'), '  I miei progressi  ');
});

test('English and user-written text remain untouched', () => {
  assert.equal(translateText('My library', 'en'), 'My library');
  assert.equal(translateText('Buongiorno, come stai?', 'it'), 'Buongiorno, come stai?');
  assert.equal(translateText('My custom deck', 'it'), 'My custom deck');
});
