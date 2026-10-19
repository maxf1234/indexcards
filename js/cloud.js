// Accounts and sync via Supabase (auth + Postgres with Row Level Security).
// Accounts are optional: the app is fully usable signed out. Signing in backs
// up every set and keeps devices in sync.

import { CLOUD, isCloudConfigured } from './cloud-config.js';
import { can } from './config.js';
import * as store from './store.js';
import { mergeRemote, toRows } from './sync.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const PAGE = 1000;
const PUSH_DELAY = 1500;
const PERIODIC = 5 * 60 * 1000;

let client = null;
let user = null;
let status = { state: 'signed-out', lastSync: null, error: null }; // signed-out | idle | syncing | error | offline
const listeners = new Set();
let pushTimer = null;
let syncing = null;
let resyncRequested = false;

export const configured = isCloudConfigured;

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn({ user, status }));
}

function setStatus(patch) {
  status = { ...status, ...patch };
  emit();
}

export function getUser() {
  return user;
}

export function getStatus() {
  return status;
}

export function displayName(u = user) {
  if (!u) return '';
  return u.user_metadata?.display_name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'You';
}

async function getClient() {
  if (client) return client;
  if (!configured()) throw new Error('Accounts are not set up on this site yet.');
  // Tests inject a fake client factory; production lazy-loads the SDK so
  // signed-out visitors never download it.
  const createClient = globalThis.__IC_SUPABASE__ || (await import(SUPABASE_ESM)).createClient;
  client = createClient(CLOUD.supabaseUrl, CLOUD.supabaseAnonKey, {
    auth: {
      // PKCE puts the auth code in ?code= rather than the #fragment, which our
      // hash router owns.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

function redirectUrl(hash = '') {
  return `${location.origin}${location.pathname}${hash}`;
}

// ---------- Lifecycle ----------

export async function init() {
  if (!configured()) return;
  const sb = await getClient();
  sb.auth.onAuthStateChange((event, session) => {
    // Defer: supabase-js warns against awaiting other calls inside this callback.
    setTimeout(() => handleAuth(event, session), 0);
  });
  const { data } = await sb.auth.getSession();
  await handleAuth('INITIAL_SESSION', data.session);

  // Drop ?code=… left by email links / OAuth once the SDK has consumed it.
  if (new URLSearchParams(location.search).has('code')) {
    history.replaceState(null, '', location.pathname + location.hash);
  }

  store.subscribe(schedulePush);
  window.addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());
  setInterval(() => sync(), PERIODIC);
}

async function handleAuth(event, session) {
  const next = session?.user || null;
  if (event === 'PASSWORD_RECOVERY') location.hash = '/account?reset=1';
  const changed = next?.id !== user?.id;
  user = next;
  if (!user) {
    setStatus({ state: 'signed-out', error: null });
    return;
  }
  if (event === 'USER_UPDATED' || !changed) {
    emit();
    return;
  }
  store.setSyncUser(user.id);
  setStatus({ state: 'idle', error: null });
  await sync();
}

// ---------- Auth actions ----------

export async function signUp({ email, password, name }) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { display_name: name || '' }, emailRedirectTo: redirectUrl('#/account') },
  });
  if (error) throw error;
  // With email confirmation on, there's a user but no session until they click the link.
  return { needsConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithProvider(provider) {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl('#/') } });
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const sb = await getClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('#/account?reset=1') });
  if (error) throw error;
}

export async function updatePassword(password) {
  const sb = await getClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

export async function updateProfile({ name }) {
  const sb = await getClient();
  const { data, error } = await sb.auth.updateUser({ data: { display_name: name } });
  if (error) throw error;
  user = data.user;
  emit();
}

export async function signOut({ clearDevice = false } = {}) {
  // Push anything pending first so nothing is lost.
  try {
    await sync();
  } catch {}
  const sb = await getClient();
  await sb.auth.signOut();
  user = null;
  if (clearDevice) store.resetAll();
  setStatus({ state: 'signed-out', lastSync: null, error: null });
}

export async function deleteAccount() {
  const sb = await getClient();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  await sb.auth.signOut();
  user = null;
  store.setSyncUser(null);
  setStatus({ state: 'signed-out', lastSync: null, error: null });
}

// ---------- Sync ----------

function schedulePush() {
  if (!user) return;
  const { sets, deletions } = store.getDirty();
  if (!sets.length && !deletions.length) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => sync(), PUSH_DELAY);
}

// Pull remote changes, merge, then push local changes. Concurrent calls share
// one run, and a call made mid-run triggers one more pass afterwards.
export function sync() {
  if (!user || !can('cloudSync')) return Promise.resolve();
  if (syncing) {
    resyncRequested = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        resyncRequested = false;
        await runSync();
      } while (resyncRequested);
      setStatus({ state: 'idle', lastSync: Date.now(), error: null });
    } catch (e) {
      console.warn('Sync failed', e);
      setStatus({ state: navigator.onLine === false ? 'offline' : 'error', error: e.message || String(e) });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function runSync() {
  const sb = await getClient();
  setStatus({ state: 'syncing' });
  const userId = user.id;

  // 1. Pull everything changed on the server since our last pull.
  const { lastPull } = store.getSyncMeta();
  let newestPull = lastPull;
  let received = false;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('sets').select('id,data,modified_at,deleted,updated_at').order('updated_at', { ascending: true });
    if (lastPull) q = q.gt('updated_at', lastPull);
    const { data: rows, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!rows.length) break;
    const changes = mergeRemote(store.snapshot(), rows);
    received ||= changes.upserts.length > 0 || changes.deletions.length > 0;
    store.applyRemote(changes);
    newestPull = rows[rows.length - 1].updated_at;
    if (rows.length < PAGE) break;
  }
  if (newestPull !== lastPull) store.markSynced([], newestPull);

  // 2. Push local changes.
  const dirty = store.getDirty();
  // Serialize now: an edit made while the upload is in flight must stay dirty.
  const rows = JSON.parse(JSON.stringify(toRows(userId, dirty)));
  if (rows.length) {
    const { error } = await sb.from('sets').upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
    store.markSynced(rows.map((r) => ({ id: r.id, ts: r.modified_at })));
  }
  // Let open screens refresh when another device's changes arrived.
  if (received) window.dispatchEvent(new CustomEvent('ic:remote-change'));
}
