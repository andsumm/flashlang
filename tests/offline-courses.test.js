import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCachedCourse } from '../src/offline-courses.js';

function entry({ answer = 'Fresh answer', confidence = 0, reviewCount = 0 } = {}) {
  return {
    ownerId: 'owner-one',
    course: {
      id: 'course-one',
      title: 'Italian',
      description: '',
      color: 'blue',
      icon: 'globe',
      visibility: 'public',
      createdAt: '2026-11-01T10:00:00.000Z',
      decks: [{
        id: 'deck-one',
        title: 'Greetings',
        createdAt: '2026-11-01T11:00:00.000Z',
        cards: [{
          id: 'card-one',
          question: 'Ciao?',
          answer,
          confidence,
          reviewCount,
          dueAt: confidence ? '2026-11-10T10:00:00.000Z' : null,
          reviewedAt: confidence ? '2026-11-07T10:00:00.000Z' : null,
          starred: confidence > 0,
        }],
      }],
    },
  };
}

test('cached public course progress is retained when fresh course content loads', () => {
  const cached = entry({ answer: 'Older answer', confidence: 4, reviewCount: 8 });
  cached.offlineCached = true;
  cached.progress = {
    'card-one': {
      confidence: 4, dueAt: '2026-11-10T10:00:00.000Z', reviewedAt: '2026-11-07T10:00:00.000Z',
      reviewCount: 8, starred: true, updatedAt: '2026-11-07T10:00:00.000Z',
    },
  };
  const remote = entry({ answer: 'Updated answer' });

  const merged = mergeCachedCourse(remote, cached);

  assert.equal(merged.offlineCached, true);
  assert.equal(merged.course.decks[0].cards[0].answer, 'Updated answer');
  assert.equal(merged.course.decks[0].cards[0].confidence, 4);
  assert.equal(merged.course.decks[0].cards[0].reviewCount, 8);
  assert.equal(merged.course.decks[0].cards[0].starred, true);
  assert.equal(remote.course.decks[0].cards[0].confidence, 0);
});

test('newer cloud progress wins while newer offline progress remains intact', () => {
  const cached = entry({ confidence: 4, reviewCount: 8 });
  cached.progress = {
    'card-one': {
      confidence: 4, dueAt: null, reviewedAt: '2026-11-07T10:00:00.000Z',
      reviewCount: 8, starred: true, updatedAt: '2026-11-07T10:00:00.000Z',
    },
  };
  const cloudProgress = [{
    cardId: 'card-one',
    progress: {
      confidence: 2, dueAt: null, reviewedAt: '2026-11-08T10:00:00.000Z',
      reviewCount: 9, starred: false,
    },
    updatedAt: '2026-11-08T10:00:00.000Z',
  }];
  const remoteWins = mergeCachedCourse(entry(), cached, cloudProgress);
  assert.equal(remoteWins.course.decks[0].cards[0].confidence, 2);

  cloudProgress[0].updatedAt = '2026-11-06T10:00:00.000Z';
  const localWins = mergeCachedCourse(entry(), cached, cloudProgress);
  assert.equal(localWins.course.decks[0].cards[0].confidence, 4);
});

test('a public course without a saved copy is not marked available offline', () => {
  const merged = mergeCachedCourse(entry(), null);
  assert.equal(merged.offlineCached, false);
  assert.deepEqual(merged.progress, {});
});
