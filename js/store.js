// Local-first persistence. Everything lives in the browser (localStorage), so
// the app works with no account, no server, and offline. A cloud-sync adapter
// can later implement the same interface (see docs/PRODUCT.md).

import { uid } from './util.js';
import { newSrs } from './srs.js';

const KEY = 'indexcards:v1';
const listeners = new Set();

const defaultState = () => ({
  version: 1,
  sets: {},
  settings: { theme: 'auto', audio: false },
  stats: { streak: 0, lastStudyDay: null, reviewsToday: 0, reviewDay: null },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Could not load saved data', e);
  }
  return defaultState();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Could not save', e);
    alert('Saving failed — your browser storage may be full. Export a backup from Settings.');
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSettings() {
  return state.settings;
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
}

export function getStats() {
  return state.stats;
}

export function listSets() {
  return Object.values(state.sets).sort(
    (a, b) => (b.lastStudied || b.updatedAt) - (a.lastStudied || a.updatedAt)
  );
}

export function getSet(id) {
  return state.sets[id] || null;
}

export function makeCard(term = '', definition = '') {
  return { id: uid(), term, definition, starred: false, srs: newSrs() };
}

export function saveSet({ id, title, description = '', cards, folder = '' }) {
  const now = Date.now();
  const existing = id && state.sets[id];
  const set = {
    id: id || uid(),
    title: title.trim() || 'Untitled set',
    description: description.trim(),
    folder: folder.trim(),
    cards: cards.map((c) => ({
      id: c.id || uid(),
      term: c.term,
      definition: c.definition,
      starred: !!c.starred,
      srs: c.srs || newSrs(),
    })),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    lastStudied: existing ? existing.lastStudied : null,
    best: existing ? existing.best : {},
  };
  state.sets[set.id] = set;
  persist();
  return set;
}

export function deleteSet(id) {
  delete state.sets[id];
  persist();
}

export function updateCard(setId, cardId, patch) {
  const set = state.sets[setId];
  if (!set) return;
  const card = set.cards.find((c) => c.id === cardId);
  if (!card) return;
  Object.assign(card, patch);
  persist();
}

export function touchStudied(setId) {
  const set = state.sets[setId];
  if (set) set.lastStudied = Date.now();
  bumpStreak();
  persist();
}

export function recordBest(setId, mode, value, lowerIsBetter = true) {
  const set = state.sets[setId];
  if (!set) return false;
  set.best = set.best || {};
  const prev = set.best[mode];
  const better = prev == null || (lowerIsBetter ? value < prev : value > prev);
  if (better) {
    set.best[mode] = value;
    persist();
  }
  return better;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function bumpStreak() {
  const s = state.stats;
  const t = today();
  if (s.lastStudyDay === t) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  s.streak = s.lastStudyDay === yesterday ? s.streak + 1 : 1;
  s.lastStudyDay = t;
}

export function countReview() {
  const s = state.stats;
  const t = today();
  if (s.reviewDay !== t) {
    s.reviewDay = t;
    s.reviewsToday = 0;
  }
  s.reviewsToday += 1;
}

export function exportBackup() {
  return JSON.stringify({ app: 'indexcards', ...state }, null, 2);
}

export function importBackup(json, { merge = true } = {}) {
  const data = JSON.parse(json);
  if (!data || typeof data.sets !== 'object') throw new Error('Not a valid backup file');
  if (!merge) state = defaultState();
  for (const set of Object.values(data.sets)) {
    state.sets[set.id] = set;
  }
  if (!merge && data.settings) state.settings = data.settings;
  persist();
  return Object.keys(data.sets).length;
}

export function resetAll() {
  state = defaultState();
  persist();
}
