import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, getMastery, getStreak, resolveStudyScope, scheduleReview, selectStudyCards } from '../src/study.js';

const now = new Date('2026-11-07T12:00:00Z');

test('confidence controls the next review without mutating the original', () => {
  const card = { id: 'a', confidence: 0, reviewCount: 0 };
  const reviewed = scheduleReview(card, 1, now);
  assert.equal(reviewed.dueAt, '2026-11-07T12:01:00.000Z');
  assert.equal(reviewed.reviewCount, 1);
  assert.equal(reviewed.confidence, 1);
  assert.equal(card.confidence, 0);
  assert.equal(scheduleReview(card, 5, now).dueAt, '2026-11-14T12:00:00.000Z');
});

test('successful reviews expand intervals, weak reviews reset, intervals cap at a year', () => {
  const repeated = { confidence: 5, reviewCount: 4 };
  assert.ok(Date.parse(scheduleReview(repeated, 5, now).dueAt) - now.getTime() > 7 * 86400000);
  assert.equal(Date.parse(scheduleReview(repeated, 2, now).dueAt) - now.getTime(), 600000);
  assert.equal(Date.parse(scheduleReview({ confidence: 5, reviewCount: 1000 }, 5, now).dueAt) - now.getTime(), 365 * 86400000);
  assert.throws(() => scheduleReview(repeated, 0, now), /1 to 5/);
  assert.throws(() => scheduleReview(repeated, 2.5, now), /1 to 5/);
});

test('smart queue prioritizes overdue and new cards without showing mastered early cards', () => {
  const cards = [
    { id: 'early', confidence: 5, reviewCount: 2, dueAt: '2026-12-01T12:00:00Z' },
    { id: 'new', confidence: 0, reviewCount: 0 },
    { id: 'due', confidence: 2, reviewCount: 1, dueAt: '2026-11-01T12:00:00Z' },
  ];
  assert.deepEqual(selectStudyCards(cards, { now }).map(card => card.id), ['due', 'new']);
  assert.equal(selectStudyCards(cards, { now, limit: 1 })[0].id, 'due');
  assert.equal(selectStudyCards(cards, { now, mode: 'all' }).length, 3);
  assert.equal(selectStudyCards([cards[0]], { now }).length, 1);
  assert.equal(selectStudyCards(cards, { now, limit: 0 }).length, 0);
});

test('last study scope resumes a populated class or deck and falls back to all', () => {
  const library = { classes: [
    { id: 'class-a', decks: [{ id: 'deck-a', cards: [{}] }, { id: 'deck-empty', cards: [] }] },
    { id: 'class-empty', decks: [] },
  ] };
  assert.deepEqual(resolveStudyScope(library, { scope: 'class', scopeId: 'class-a' }), { scope: 'class', scopeId: 'class-a' });
  assert.deepEqual(resolveStudyScope(library, { scope: 'deck', scopeId: 'deck-a' }), { scope: 'deck', scopeId: 'deck-a' });
  assert.deepEqual(resolveStudyScope(library, { scope: 'deck', scopeId: 'deck-empty' }), { scope: 'all', scopeId: null });
  assert.deepEqual(resolveStudyScope(library, { scope: 'class', scopeId: 'deleted' }), { scope: 'all', scopeId: null });
  assert.deepEqual(resolveStudyScope(library, null), { scope: 'all', scopeId: null });
});

test('mastery includes unseen cards', () => {
  assert.equal(getMastery([]), 0);
  assert.equal(getMastery([{ confidence: 5 }, { confidence: 0 }]), 50);
  assert.equal(getMastery([{ confidence: 2 }, { confidence: 3 }]), 50);
});

test('streak uses local dates, joins duplicate sessions, and allows yesterday', () => {
  const localNow = new Date(2026, 10, 7, 12);
  assert.equal(dateKey(localNow), '2026-11-07');
  assert.equal(getStreak([{ date: '2026-11-07', cards: 2 }, { date: '2026-11-06', cards: 2 }, { date: '2026-11-06', cards: 3 }, { date: '2026-11-05', cards: 1 }], localNow), 3);
  assert.equal(getStreak([{ date: '2026-11-06', cards: 1 }], localNow), 1);
  assert.equal(getStreak([{ date: '2026-11-05', cards: 1 }], localNow), 0);
  assert.equal(getStreak([{ date: '2026-11-07', cards: 0 }], localNow), 0);
});
