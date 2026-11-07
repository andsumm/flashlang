import { dateKey, getMastery, getStreak } from './study.js';

function localDay(now, offset = 0) {
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() + offset);
  return day;
}

/** Derive account statistics from the library already saved with each user. */
export function getStudyStats(library, now = new Date()) {
  const cards = library.classes.flatMap(cls => cls.decks.flatMap(deck => deck.cards));
  const activity = library.activity || [];
  const byDay = new Map();
  let totalReviews = 0;
  let totalSeconds = 0;
  for (const item of activity) {
    const count = Math.max(0, Number(item.cards) || 0);
    totalReviews += count;
    totalSeconds += Math.max(0, Number(item.seconds) || 0);
    byDay.set(item.date, (byDay.get(item.date) || 0) + count);
  }
  const today = dateKey(now);
  const dailyGoal = library.settings?.dailyGoal || 20;
  const todayReviews = byDay.get(today) || 0;
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const date = localDay(now, i - 13);
    return { key: dateKey(date), date, count: byDay.get(dateKey(date)) || 0 };
  });
  const last84Days = Array.from({ length: 84 }, (_, i) => {
    const date = localDay(now, i - 83);
    return { key: dateKey(date), date, count: byDay.get(dateKey(date)) || 0 };
  });
  const time = now.getTime();
  const reviewedCards = cards.filter(card => card.reviewCount > 0).length;
  const masteredCards = cards.filter(card => card.reviewCount > 0 && card.confidence >= 4).length;
  const newCards = cards.filter(card => !card.reviewCount).length;
  const dueCards = cards.filter(card => card.reviewCount > 0 && (!card.dueAt || Date.parse(card.dueAt) <= time)).length;
  const weakCards = cards.filter(card => card.reviewCount > 0 && card.confidence <= 2).length;
  const confidence = Array.from({ length: 6 }, (_, i) => cards.filter(card => card.confidence === i).length);
  const level = Math.floor(totalReviews / 50) + 1;
  const completedGoals = [...byDay.values()].filter(count => count >= dailyGoal).length;
  const activeDays = [...byDay.values()].filter(count => count > 0).length;
  return {
    cards: cards.length, reviewedCards, masteredCards, newCards, dueCards, weakCards,
    mastery: getMastery(cards), confidence, totalReviews, totalSeconds,
    totalMinutes: Math.round(totalSeconds / 60), activeDays, completedGoals,
    todayReviews, dailyGoal, goalPercent: Math.min(100, Math.round(todayReviews / dailyGoal * 100)),
    streak: getStreak(activity, now), xp: totalReviews * 10, level,
    levelPercent: totalReviews % 50 * 2, last14Days, last84Days,
    last14Total: last14Days.reduce((sum, day) => sum + day.count, 0),
  };
}
