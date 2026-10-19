// Spaced repetition scheduling (SM-2 variant, the same family Anki uses).
// Quizlet has no true long-term scheduler; this is a core differentiator.

const DAY = 86400000;
const MIN = 60000;

export const RATINGS = [
  { key: 'again', label: 'Again', hotkey: '1' },
  { key: 'hard', label: 'Hard', hotkey: '2' },
  { key: 'good', label: 'Good', hotkey: '3' },
  { key: 'easy', label: 'Easy', hotkey: '4' },
];

export function newSrs() {
  return { due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
}

export function isDue(card, now = Date.now()) {
  return !card.srs || card.srs.due <= now;
}

export function isNew(card) {
  return !card.srs || card.srs.reps === 0;
}

// Returns a new srs object; interval is in days (fractional for learning steps).
export function schedule(srs, rating, now = Date.now()) {
  const s = { ...newSrs(), ...srs };
  if (rating === 'again') {
    s.lapses += s.reps > 0 ? 1 : 0;
    s.reps = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.interval = 0;
    s.due = now + 1 * MIN;
    return s;
  }
  if (s.reps === 0) {
    s.interval = rating === 'hard' ? 0 : rating === 'good' ? 1 : 4;
    if (rating === 'hard') {
      s.due = now + 10 * MIN;
      s.ease = Math.max(1.3, s.ease - 0.15);
      return s;
    }
  } else if (rating === 'hard') {
    s.interval = Math.max(1, s.interval * 1.2);
    s.ease = Math.max(1.3, s.ease - 0.15);
  } else if (rating === 'good') {
    s.interval = Math.max(1, s.interval * s.ease);
  } else {
    s.interval = Math.max(2, s.interval * s.ease * 1.3);
    s.ease += 0.15;
  }
  s.reps += 1;
  s.interval = Math.round(s.interval * 100) / 100;
  s.due = now + s.interval * DAY;
  return s;
}

export function previewInterval(srs, rating) {
  const next = schedule(srs, rating, 0);
  return humanDuration(next.due);
}

export function humanDuration(ms) {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

// Mastery bucket for the set overview.
export function masteryOf(card) {
  const s = card.srs;
  if (!s || s.reps === 0) return s && s.lapses ? 'learning' : 'new';
  if (s.interval >= 21) return 'mastered';
  return 'learning';
}
