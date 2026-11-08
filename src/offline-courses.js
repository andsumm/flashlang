import { validateLibrary } from './data.js';

const DATABASE_NAME = 'flashlang-offline-courses';
const STORE_NAME = 'courses';
const DATABASE_VERSION = 1;
const PROGRESS_FIELDS = ['confidence', 'dueAt', 'reviewedAt', 'reviewCount', 'starred'];

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

export async function loadCachedPublicCourses() {
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
      return { ownerId: entry.ownerId, course: entry.course, offlineCached: true };
    });
  } finally {
    database.close();
  }
}

export async function saveCachedPublicCourse(value) {
  const entry = courseEntry(value);
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ ...entry, cachedAt: new Date().toISOString() });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save this course for offline use.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving this course for offline use was interrupted.'));
    });
  } finally {
    database.close();
  }
}

export function mergeCachedCourse(remoteEntry, cachedEntry) {
  if (!cachedEntry) return { ...remoteEntry, offlineCached: false };
  const course = structuredClone(remoteEntry.course);
  const savedCards = new Map(cachedEntry.course.decks.flatMap(deck => deck.cards.map(card => [card.id, card])));
  for (const deck of course.decks) {
    for (const card of deck.cards) {
      const saved = savedCards.get(card.id);
      if (saved) for (const field of PROGRESS_FIELDS) card[field] = saved[field];
    }
  }
  return { ...remoteEntry, course, offlineCached: true };
}
