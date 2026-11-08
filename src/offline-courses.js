import { validateLibrary } from './data.js';

const DATABASE_NAME = 'flashlang-offline-courses';
const STORE_NAME = 'courses';
const DATABASE_VERSION = 1;
const PROGRESS_FIELDS = ['confidence', 'dueAt', 'reviewedAt', 'reviewCount', 'starred'];

function cardProgress(card) {
  return Object.fromEntries(PROGRESS_FIELDS.map(field => [field, card[field]]));
}

function hasProgress(progress) {
  return Boolean(progress && (progress.confidence || progress.reviewCount || progress.starred || progress.dueAt || progress.reviewedAt));
}

function validProgress(value) {
  return value && Number.isFinite(Date.parse(value.updatedAt))
    ? { ...cardProgress(value), updatedAt: new Date(value.updatedAt).toISOString() }
    : null;
}

function resetCourseProgress(course) {
  for (const card of course.decks.flatMap(deck => deck.cards)) {
    card.confidence = 0;
    card.dueAt = null;
    card.reviewedAt = null;
    card.reviewCount = 0;
    card.starred = false;
  }
}

function applyProgress(course, progress) {
  const saved = new Map(Object.entries(progress).map(([id, value]) => [id, validProgress(value)]));
  for (const card of course.decks.flatMap(deck => deck.cards)) {
    const value = saved.get(card.id);
    if (value) for (const field of PROGRESS_FIELDS) card[field] = value[field];
  }
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Offline course storage is unavailable in this browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline course storage.'));
    request.onblocked = () => reject(new Error('Offline course storage is blocked by another tab.'));
  });
}

function courseEntry(entry) {
  if (!entry || typeof entry.ownerId !== 'string' || !entry.ownerId || !entry.course || typeof entry.course.id !== 'string') {
    throw new Error('This public course cannot be saved for offline use because its data is invalid.');
  }
  const course = validateLibrary({
    version: 1,
    classes: [entry.course],
    activity: [],
    settings: { dailyGoal: 20 },
  }).classes[0];
  if (course.visibility !== 'public') throw new Error('Private courses cannot be saved as public offline courses.');
  return { id: course.id, ownerId: entry.ownerId, course };
}

export async function loadCachedPublicCourses(userId = 'guest') {
  const database = await openDatabase();
  try {
    const rows = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read offline courses.'));
    });
    return rows.map(row => {
      const entry = courseEntry(row);
      if (row.id !== entry.course.id) throw new Error('Offline course ID does not match its saved data.');
      const progress = row.progressByUser?.[userId] && typeof row.progressByUser[userId] === 'object'
        ? row.progressByUser[userId]
        : userId === 'guest' && row.progress && typeof row.progress === 'object' ? row.progress : {};
      if (!Object.keys(progress).length && userId === 'guest' && row.cachedAt) {
        for (const card of entry.course.decks.flatMap(deck => deck.cards)) {
          if (hasProgress(card)) progress[card.id] = { ...cardProgress(card), updatedAt: card.reviewedAt || row.cachedAt };
        }
      }
      resetCourseProgress(entry.course);
      applyProgress(entry.course, progress);
      return { ownerId: entry.ownerId, course: entry.course, progress, offlineCached: true };
    });
  } finally {
    database.close();
  }
}

export async function saveCachedPublicCourse(value, { userId = 'guest', touchedCardId = null, preserveProgress = false } = {}) {
  const entry = courseEntry(value);
  const database = await openDatabase();
  try {
    const saved = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const get = store.get(entry.id);
      let result;
      let savedProgress;
      get.onsuccess = () => {
        const previous = get.result;
        const progressByUser = previous?.progressByUser && typeof previous.progressByUser === 'object' ? { ...previous.progressByUser } : {};
        const previousProgress = progressByUser[userId] && typeof progressByUser[userId] === 'object'
          ? progressByUser[userId]
          : userId === 'guest' && previous?.progress && typeof previous.progress === 'object' ? previous.progress : {};
        const progress = preserveProgress && value.progress && typeof value.progress === 'object'
          ? Object.fromEntries(Object.entries(value.progress).filter(([, item]) => validProgress(item)))
          : { ...previousProgress };
        const cachedAt = new Date().toISOString();
        for (const card of preserveProgress ? [] : entry.course.decks.flatMap(deck => deck.cards)) {
          const before = validProgress(progress[card.id]);
          const changed = touchedCardId === card.id || (before && PROGRESS_FIELDS.some(field => before[field] !== card[field]));
          if (changed) progress[card.id] = { ...cardProgress(card), updatedAt: cachedAt };
          else if (!before && userId === 'guest' && !previous?.progressByUser && previous?.cachedAt) {
            const oldCard = previous.course?.decks.flatMap(deck => deck.cards).find(item => item.id === card.id);
            if (oldCard && hasProgress(oldCard)) {
              progress[card.id] = { ...cardProgress(oldCard), updatedAt: oldCard.reviewedAt || previous.cachedAt };
            }
          }
        }
        progressByUser[userId] = progress;
        savedProgress = progress;
        const storedCourse = structuredClone(entry.course);
        resetCourseProgress(storedCourse);
        result = { ...entry, course: storedCourse, progressByUser, cachedAt };
        store.put(result);
      };
      transaction.oncomplete = () => resolve({ ...result, progress: savedProgress });
      transaction.onerror = () => reject(transaction.error || new Error('Could not save this course for offline use.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving this course for offline use was interrupted.'));
    });
    return { ownerId: saved.ownerId, course: saved.course, progress: saved.progress, offlineCached: true };
  } finally {
    database.close();
  }
}

export function mergeCachedCourse(remoteEntry, cachedEntry, cloudProgress = []) {
  const course = structuredClone(remoteEntry.course);
  const progress = {};
  const localProgress = cachedEntry?.progress && typeof cachedEntry.progress === 'object' ? cachedEntry.progress : {};
  const cloudByCard = new Map(cloudProgress.map(row => [row.cardId, {
    ...row.progress,
    updatedAt: row.updatedAt || row.updated_at,
  }]));
  for (const deck of course.decks) {
    for (const card of deck.cards) {
      const local = validProgress(localProgress[card.id]);
      const cloud = validProgress(cloudByCard.get(card.id));
      const selected = cloud && (!local || Date.parse(cloud.updatedAt) > Date.parse(local.updatedAt)) ? cloud : local;
      if (!selected) continue;
      for (const field of PROGRESS_FIELDS) card[field] = selected[field];
      progress[card.id] = selected;
    }
  }
  return { ...remoteEntry, course, progress, offlineCached: Boolean(cachedEntry?.offlineCached) };
}
