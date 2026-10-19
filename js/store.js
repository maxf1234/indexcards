// Local-first persistence. Everything lives in the browser (localStorage), so
// the app works with no account, no server, and offline. When signed in,
// js/cloud.js mirrors changes to the account: every mutation stamps the set's
// `modifiedAt`, and deletions leave a tombstone, so sync can tell what changed.

import { uid } from './util.js';
import { newSrs } from './srs.js';

const KEY = 'indexcards:v1';
const listeners = new Set();

const defaultState = () => ({
  version: 1,
  sets: {},
  settings: { theme: 'auto', audio: false },
  stats: { streak: 0, lastStudyDay: null, reviewsToday: 0, reviewDay: null },
  deleted: {}, // setId -> deletion time (tombstones for sync)
  sync: { userId: null, synced: {}, lastPull: null }, // synced: setId -> modifiedAt last pushed/pulled
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

function modifiedAt(set) {
  return set.modifiedAt || set.updatedAt || 0;
}

function bump(set) {
  // Strictly increasing so two edits in the same millisecond still count as a change.
  set.modifiedAt = Math.max(Date.now(), modifiedAt(set) + 1);
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
    modifiedAt: existing ? modifiedAt(existing) : 0,
  };
  bump(set);
  delete state.deleted[set.id];
  state.sets[set.id] = set;
  persist();
  return set;
}

export function deleteSet(id) {
  delete state.sets[id];
  state.deleted[id] = Date.now();
  persist();
}

export function updateCard(setId, cardId, patch) {
  const set = state.sets[setId];
  if (!set) return;
  const card = set.cards.find((c) => c.id === cardId);
  if (!card) return;
  Object.assign(card, patch);
  bump(set);
  persist();
}

export function touchStudied(setId) {
  const set = state.sets[setId];
  if (set) {
    set.lastStudied = Date.now();
    bump(set);
  }
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
    bump(set);
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
    bump(set);
    delete state.deleted[set.id];
  }
  if (!merge && data.settings) state.settings = data.settings;
  persist();
  return Object.keys(data.sets).length;
}

export function resetAll() {
  state = defaultState();
  persist();
}

// ---------- Sync support (used by js/cloud.js) ----------

export function getSyncMeta() {
  return state.sync;
}

// Switching accounts on a device: forget what was synced for the previous one,
// so everything local counts as unsynced for the new account.
export function setSyncUser(userId) {
  if (state.sync.userId === userId) return;
  state.sync = { userId, synced: {}, lastPull: null };
  persist();
}

export function getDirty() {
  const synced = state.sync.synced;
  const sets = Object.values(state.sets).filter((s) => modifiedAt(s) > (synced[s.id] ?? -1));
  const deletions = Object.entries(state.deleted)
    .filter(([id, ts]) => ts > (synced[id] ?? -1))
    .map(([id, ts]) => ({ id, ts }));
  return { sets, deletions };
}

export function markSynced(entries, lastPull) {
  for (const { id, ts } of entries) {
    state.sync.synced[id] = Math.max(state.sync.synced[id] ?? 0, ts);
  }
  if (lastPull) state.sync.lastPull = lastPull;
  persist();
}

// Apply remote changes without stamping them as local edits.
export function applyRemote({ upserts = [], deletions = [] }) {
  for (const set of upserts) {
    state.sets[set.id] = set;
    delete state.deleted[set.id];
    state.sync.synced[set.id] = modifiedAt(set);
  }
  for (const { id, ts } of deletions) {
    delete state.sets[id];
    state.deleted[id] = ts;
    state.sync.synced[id] = ts;
  }
  if (upserts.length || deletions.length) persist();
}

export function snapshot() {
  return { sets: state.sets, deleted: state.deleted };
}
