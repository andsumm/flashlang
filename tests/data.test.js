import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLibrary, emptyLibrary, exampleLibrary, newCard } from '../src/data.js';

function backup() {
  return {
    version: 1,
    classes: [
      {
        id: 'class-one', title: 'Italian', description: 'Useful expressions', color: 'green', icon: 'globe', visibility: 'private', createdAt: '2026-11-01T10:00:00.000Z',
        decks: [{
          id: 'deck-one', title: 'Greetings', createdAt: '2026-11-01T11:00:00.000Z',
          cards: [{ id: 'card-one', question: 'Buongiorno?', answer: 'Good morning', confidence: 4, reviewCount: 8, dueAt: '2026-11-10T10:00:00.000Z', reviewedAt: '2026-11-07T10:00:00.000Z', starred: true }],
        }],
      },
      {
        id: 'class-two', title: 'Science', description: '', color: 'purple', icon: 'bulb', visibility: 'private', createdAt: '2026-11-02T10:00:00.000Z',
        decks: [{
          id: 'deck-two', title: 'Biology', createdAt: '2026-11-02T11:00:00.000Z',
          cards: [{ id: 'card-two', question: 'What stores genetic information?', answer: 'DNA', confidence: 0, reviewCount: 0, dueAt: null, reviewedAt: null, starred: false }],
        }],
      },
    ],
    activity: [{ id: 'activity-one', date: '2026-11-07', cards: 12, seconds: 73 }],
    settings: { dailyGoal: 30, language: 'en' },
  };
}

const firstCard = library => library.classes[0].decks[0].cards[0];

test('complete JSON backup roundtrip preserves the library and all study progress', () => {
  const original = backup();
  assert.deepEqual(validateLibrary(JSON.parse(JSON.stringify(original))), original);
  assert.equal(firstCard(validateLibrary(original)).starred, true);
  assert.equal(firstCard(validateLibrary(original)).reviewCount, 8);
});

test('validation creates independent arrays and objects without mutating caller data', () => {
  const original = backup();
  const before = JSON.parse(JSON.stringify(original));
  const restored = validateLibrary(original);
  firstCard(restored).answer = 'Changed';
  restored.activity[0].cards = 999;
  restored.classes[0].decks.push({ id: 'another-deck' });
  assert.deepEqual(original, before);
});

test('IDs are unique globally across classes, decks and cards', () => {
  for (const collide of [
    library => { library.classes[1].id = library.classes[0].id; },
    library => { library.classes[1].decks[0].id = library.classes[0].decks[0].id; },
    library => { library.classes[1].decks[0].cards[0].id = firstCard(library).id; },
    library => { firstCard(library).id = library.classes[1].id; },
    library => { firstCard(library).id = library.classes[0].decks[0].id; },
  ]) {
    const library = backup(); collide(library);
    assert.throws(() => validateLibrary(library), /invalid or duplicate IDs/);
  }
});

test('invalid or oversized IDs, titles and card text are rejected', () => {
  const mutations = [
    library => { library.classes[0].id = ''; },
    library => { library.classes[0].id = 'x'.repeat(101); },
    library => { library.classes[0].title = 'x'.repeat(201); },
    library => { library.classes[0].decks[0].title = ' '; },
    library => { firstCard(library).question = 'x'.repeat(20001); },
    library => { firstCard(library).answer = ''; },
    library => { firstCard(library).question = { html: 'not text' }; },
  ];
  for (const mutate of mutations) {
    const library = backup(); mutate(library);
    assert.throws(() => validateLibrary(library));
  }
});

test('structurally invalid backups and resource limits are rejected', () => {
  for (const value of [null, [], {}, { version: 2, classes: [] }, { version: 1, classes: {} }, { version: 1, classes: [null] }]) {
    assert.throws(() => validateLibrary(value));
  }
  const noDecks = backup(); noDecks.classes[0].decks = {};
  assert.throws(() => validateLibrary(noDecks), /decks/);
  const noCards = backup(); noCards.classes[0].decks[0].cards = null;
  assert.throws(() => validateLibrary(noCards));
  const tooManyClasses = backup(); tooManyClasses.classes = Array(501).fill(tooManyClasses.classes[0]);
  assert.throws(() => validateLibrary(tooManyClasses), /valid .* backup/);
  const tooManyDecks = backup(); tooManyDecks.classes[0].decks = Array(1001).fill(tooManyDecks.classes[0].decks[0]);
  assert.throws(() => validateLibrary(tooManyDecks), /decks/);
  const tooManyCards = backup(); tooManyCards.classes[0].decks[0].cards = Array(100001).fill(firstCard(tooManyCards));
  assert.throws(() => validateLibrary(tooManyCards), /100,000/);
});

test('confidence and review counts are normalized to finite integer bounds', () => {
  for (const [input, expected] of [[-3, 0], [2.9, 2], [100, 5], ['4', 4], ['invalid', 0], [null, 0]]) {
    const library = backup(); firstCard(library).confidence = input;
    assert.equal(firstCard(validateLibrary(library)).confidence, expected);
  }
  for (const [input, expected] of [[-5, 0], [4.9, 4], [2000000, 1000000], ['invalid', 0]]) {
    const library = backup(); firstCard(library).reviewCount = input;
    assert.equal(firstCard(validateLibrary(library)).reviewCount, expected);
  }
});

test('invalid review dates reset safely and valid dates normalize to ISO', () => {
  const library = backup();
  firstCard(library).dueAt = 'not-a-date';
  firstCard(library).reviewedAt = '';
  library.classes[0].createdAt = 'invalid';
  library.classes[0].decks[0].createdAt = null;
  let restored = validateLibrary(library);
  assert.equal(firstCard(restored).dueAt, null);
  assert.equal(firstCard(restored).reviewedAt, null);
  assert.ok(Number.isFinite(Date.parse(restored.classes[0].createdAt)));
  assert.ok(Number.isFinite(Date.parse(restored.classes[0].decks[0].createdAt)));
  firstCard(library).dueAt = '2026-11-07T12:00:00+01:00';
  restored = validateLibrary(library);
  assert.equal(firstCard(restored).dueAt, '2026-11-07T11:00:00.000Z');
});

test('display preferences are restricted and unknown metadata is discarded', () => {
  const library = backup();
  library.classes[0].color = 'red; background: url(evil)';
  library.classes[0].icon = '<script>alert(1)</script>';
  library.classes[0].description = 'x'.repeat(2000);
  firstCard(library).question = '<img src=x onerror=alert(1)>';
  firstCard(library).unknownMetadata = { sensitive: true };
  library.password = 'should-not-be-preserved';
  const restored = validateLibrary(library);
  assert.equal(restored.classes[0].color, 'blue');
  assert.equal(restored.classes[0].icon, 'book');
  assert.equal(restored.classes[0].description.length, 1000);
  assert.equal(firstCard(restored).question, '<img src=x onerror=alert(1)>');
  assert.equal('unknownMetadata' in firstCard(restored), false);
  assert.equal('password' in restored, false);
});

test('course visibility is limited to public or private and defaults to private', () => {
  const library = backup();
  library.classes[0].visibility = 'public';
  library.classes[1].visibility = 'unlisted';
  const restored = validateLibrary(library);
  assert.equal(restored.classes[0].visibility, 'public');
  assert.equal(restored.classes[1].visibility, 'private');
  delete library.classes[0].visibility;
  assert.equal(validateLibrary(library).classes[0].visibility, 'private');
});

test('activity filters malformed entries and normalizes counters', () => {
  const library = backup();
  library.activity = [
    null, 42, {}, { date: 'not-a-date' }, { date: '2026-99-99', cards: 1 },
    { id: 'activity-valid', date: '2026-11-07', cards: -3, seconds: 999999 },
  ];
  const restored = validateLibrary(library);
  assert.deepEqual(restored.activity, [{ id: 'activity-valid', date: '2026-11-07', cards: 0, seconds: 86400 }]);
});

test('activity history is bounded and daily goal has sensible defaults and bounds', () => {
  const library = backup();
  library.activity = Array.from({ length: 5005 }, (_, index) => ({ id: `a-${index}`, date: '2026-11-07', cards: 1, seconds: 2 }));
  assert.equal(validateLibrary(library).activity.length, 5000);
  assert.equal(validateLibrary(library).activity[0].id, 'a-5');
  for (const [input, expected] of [[undefined, 20], ['invalid', 20], [-1, 5], [10.9, 10], [999, 500]]) {
    library.settings = { dailyGoal: input };
    assert.equal(validateLibrary(library).settings.dailyGoal, expected);
  }
  library.settings = null;
  assert.equal(validateLibrary(library).settings.dailyGoal, 20);
});

test('language setting accepts Italian and safely defaults old or invalid backups to English', () => {
  const library = backup();
  library.settings.language = 'it';
  assert.equal(validateLibrary(library).settings.language, 'it');
  delete library.settings.language;
  assert.equal(validateLibrary(library).settings.language, 'en');
  library.settings.language = '<script>';
  assert.equal(validateLibrary(library).settings.language, 'en');
});

test('empty libraries and newly created cards contain clean defaults', () => {
  assert.deepEqual(validateLibrary(emptyLibrary()), { version: 1, classes: [], activity: [], settings: { dailyGoal: 20, language: 'en' } });
  const card = newCard('Question', 'Answer');
  assert.match(card.id, /^[0-9a-f-]{36}$/i);
  assert.equal(card.confidence, 0);
  assert.equal(card.reviewCount, 0);
  assert.equal(card.starred, false);
  assert.equal(card.dueAt, null);
  assert.equal(card.reviewedAt, null);
});

test('default examples include one expanded Inglese course with unique-prompt lectures across A1–C1', () => {
  const library = exampleLibrary();
  const course = library.classes.find(item => item.title === 'Inglese');
  assert.ok(course);
  assert.equal(course.decks.length, 30);
  assert.deepEqual(course.decks.slice(0, 13).map(deck => deck.title), [
    'A1 — Greetings', 'A1 — Nouns and articles', 'A1 — Adjectives',
    'A2 — Basic conversation', 'A2 — Pronouns and origins', 'A2 — Possession',
    'A2 — Family and friends', 'B1 — Numbers and money', 'B1 — Days',
    'B1 — Time', 'B2 — Food and drink', 'B2 — Getting around', 'C1 — Pronunciation tips',
  ]);
  assert.deepEqual(course.decks.map(deck => deck.title.slice(0, 2)), ['A1', 'A1', 'A1', 'A2', 'A2', 'A2', 'A2', 'B1', 'B1', 'B1', 'B2', 'B2', 'C1']);
  const legacyLibrary = backup();
  legacyLibrary.classes[0].decks[0].title = 'A1 — 01 Greetings';
  assert.equal(validateLibrary(legacyLibrary).classes[0].decks[0].title, 'A1 — Greetings');
  assert.deepEqual(course.decks.slice(13, 16).map(deck => [deck.title, deck.cards.length]), [
    ['A1 — Everyday conversation', 12],
    ['A2 — Making plans and chatting', 12],
    ['B1 — Keeping a conversation going', 12],
  ]);
  assert.ok(course.decks.slice(16).every(deck => deck.cards.length === 80));
  const prompts = course.decks.flatMap(deck => deck.cards.map(card => card.question.toLocaleLowerCase('it')));
  assert.equal(prompts.length, 1270);
  assert.equal(new Set(prompts).size, prompts.length);
});
