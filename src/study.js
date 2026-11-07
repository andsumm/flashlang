const DAY = 86_400_000;
const INTERVALS = [60_000, 600_000, DAY, 3 * DAY, 7 * DAY];

function validDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('A valid date is required.');
  return date;
}

/** Local calendar date, deliberately independent of UTC midnight. */
export function dateKey(value = new Date()) {
  const date = validDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Higher confidence spaces reviews farther apart; low confidence resets the interval. */
export function scheduleReview(card, rating, now = new Date()) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Choose a confidence rating from 1 to 5.');
  const reviewedAt = validDate(now);
  const previousReviews = Number.isFinite(card.reviewCount) ? Math.max(0, Math.floor(card.reviewCount)) : 0;
  const multiplier = rating >= 3 && card.confidence >= 3 ? 1.6 ** Math.min(previousReviews, 12) : 1;
  const interval = Math.min(365 * DAY, INTERVALS[rating - 1] * multiplier);
  return {
    ...card,
    confidence: rating,
    reviewedAt: reviewedAt.toISOString(),
    dueAt: new Date(reviewedAt.getTime() + interval).toISOString(),
    reviewCount: previousReviews + 1,
  };
}

/** Due cards first, then unseen cards; smart sessions fall back to early practice when caught up. */
export function selectStudyCards(cards, { limit = 20, now = new Date(), mode = 'smart' } = {}) {
  const timestamp = validDate(now).getTime();
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 20;
  const ranked = cards.map((card, index) => {
    const due = card.dueAt ? Date.parse(card.dueAt) : NaN;
    const unseen = !card.reviewCount || !card.confidence;
    const isDue = !unseen && (!Number.isFinite(due) || due <= timestamp);
    return { card, index, due, priority: isDue ? 0 : unseen ? 1 : 2 };
  });
  let selected = ranked;
  if (mode === 'smart') {
    const dueAndNew = ranked.filter(item => item.priority < 2);
    if (dueAndNew.length) selected = dueAndNew;
  } else if (mode === 'weak') {
    selected = ranked.filter(item => (item.card.confidence || 0) <= 3);
  } else if (mode !== 'all') throw new Error('Choose smart, all, or weak study mode.');
  return selected.sort((a, b) => a.priority - b.priority
    || (a.priority === 0 ? (a.due || 0) - (b.due || 0) : 0)
    || (a.card.confidence || 0) - (b.card.confidence || 0)
    || a.index - b.index).slice(0, maximum).map(item => item.card);
}

export function getMastery(cards) {
  if (!cards.length) return 0;
  return Math.round(cards.reduce((sum, card) => sum + Math.min(5, Math.max(0, Number(card.confidence) || 0)), 0) / (cards.length * 5) * 100);
}

/** Current run includes yesterday if today's first study session has not happened yet. */
export function getStreak(activity, now = new Date()) {
  const studied = new Set(activity.filter(item => Number(item.cards) > 0).map(item => item.date));
  const cursor = validDate(now);
  cursor.setHours(12, 0, 0, 0);
  if (!studied.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (studied.has(dateKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
