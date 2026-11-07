import test from 'node:test';
import assert from 'node:assert/strict';
import { getStudyStats } from '../src/stats.js';

const now = new Date(2026, 10, 7, 12);
const card = (confidence, reviewCount, dueAt = null) => ({ confidence, reviewCount, dueAt });

test('statistics aggregate duplicate daily records and distinguish new, due, and strong cards', () => {
  const library = {
    classes: [{ decks: [{ cards: [
      card(0, 0), card(1, 2, '2026-11-06T12:00:00Z'),
      card(4, 1, '2026-11-09T12:00:00Z'), card(5, 3, null),
    ] }] }],
    activity: [
      { date: '2026-11-07', cards: 7, seconds: 120 },
      { date: '2026-11-07', cards: 5, seconds: 180 },
      { date: '2026-11-06', cards: 20, seconds: 600 },
    ],
    settings: { dailyGoal: 10 },
  };
  const stats = getStudyStats(library, now);
  assert.equal(stats.totalReviews, 32);
  assert.equal(stats.totalMinutes, 15);
  assert.equal(stats.todayReviews, 12);
  assert.equal(stats.goalPercent, 100);
  assert.equal(stats.activeDays, 2);
  assert.equal(stats.completedGoals, 2);
  assert.equal(stats.streak, 2);
  assert.equal(stats.newCards, 1);
  assert.equal(stats.dueCards, 2);
  assert.equal(stats.weakCards, 1);
  assert.equal(stats.masteredCards, 2);
  assert.equal(stats.reviewedCards, 3);
  assert.deepEqual(stats.confidence, [1, 1, 0, 0, 1, 1]);
  assert.equal(stats.last14Days.at(-1).count, 12);
  assert.equal(stats.last84Days.length, 84);
  assert.equal(stats.level, 1);
  assert.equal(stats.levelPercent, 64);
});

test('empty library gives usable zero statistics and a full calendar', () => {
  const stats = getStudyStats({ classes: [], activity: [], settings: { dailyGoal: 20 } }, now);
  assert.equal(stats.cards, 0);
  assert.equal(stats.totalReviews, 0);
  assert.equal(stats.mastery, 0);
  assert.equal(stats.goalPercent, 0);
  assert.equal(stats.streak, 0);
  assert.equal(stats.last84Days[0].key, '2026-08-16');
  assert.equal(stats.last84Days.at(-1).key, '2026-11-07');
});
