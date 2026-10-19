// Account page: sign in / sign up / reset password / profile, sync status and
// account deletion.

import * as cloud from './cloud.js';
import * as store from './store.js';
import { esc, toast, timeAgo, plural, $, $$ } from './util.js';

const PROVIDER_LABELS = { google: 'Google', github: 'GitHub', apple: 'Apple', azure: 'Microsoft', discord: 'Discord' };

export function renderAccount(app, query, { go, providers = [] }) {
  const draw = () => {
    if (!cloud.configured()) return notConfigured(app);
    const user = cloud.getUser();
    if (user && query.get('reset') === '1') return resetForm(app, go);
    if (user) return profile(app, user, go);
    return authForms(app, query, providers);
  };
  let shownFor = cloud.getUser()?.id ?? null;
  draw();
  // Re-draw only when who is signed in changes (sync status updates fire
  // often and must not wipe a half-typed form).
  return cloud.onChange(({ user }) => {
    const id = user?.id ?? null;
    if (id !== shownFor) {
      shownFor = id;
      draw();
    } else updateSyncPanel(app);
  });
}

function notConfigured(app) {
  app.innerHTML = `
    <div class="page narrow">
      <a class="back" href="#/">← Back</a>
      <h1>Accounts</h1>
      <div class="callout">Sign-in isn't switched on for this site yet. Everything still works — your sets are saved in this browser.</div>
      <p class="muted small">Site owner: add your Supabase URL and anon key to <code>js/cloud-config.js</code> (see <code>docs/ACCOUNTS.md</code>).</p>
    </div>`;
}

function authForms(app, query, providers) {
  const mode = query.get('mode') === 'signup' ? 'signup' : 'signin';
  const localCount = store.listSets().length;
  app.innerHTML = `
    <div class="page auth-page">
      <div class="auth-card panel">
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="signin" class="${mode === 'signin' ? 'on' : ''}">Sign in</button>
          <button role="tab" data-tab="signup" class="${mode === 'signup' ? 'on' : ''}">Create account</button>
        </div>
        <p class="muted small">Optional and free. An account backs up your sets and syncs them across your devices.${
          localCount ? ` The ${plural(localCount, 'set')} on this device will be added to your account.` : ''
        }</p>
        ${
          providers.length
            ? `<div class="oauth">${providers
                .map((p) => `<button class="btn" data-provider="${esc(p)}">Continue with ${esc(PROVIDER_LABELS[p] || p)}</button>`)
                .join('')}</div><div class="divider"><span>or</span></div>`
            : ''
        }
        <form id="auth" novalidate>
          <label class="field signup-only">Name <input class="input" name="name" autocomplete="name" placeholder="What should we call you?"></label>
          <label class="field">Email <input class="input" name="email" type="email" autocomplete="email" required></label>
          <label class="field">Password <input class="input" name="password" type="password" minlength="8" required></label>
          <p class="error" id="err" role="alert" hidden></p>
          <button class="btn primary lg" id="submit"></button>
        </form>
        <button class="link-btn signin-only" id="forgot">Forgot password?</button>
      </div>
    </div>`;

  let current = mode;
  const form = $('#auth', app);
  const err = $('#err', app);
  const setMode = (m) => {
    current = m;
    $$('[data-tab]', app).forEach((b) => b.classList.toggle('on', b.dataset.tab === m));
    $$('.signup-only', app).forEach((el) => (el.hidden = m !== 'signup'));
    $$('.signin-only', app).forEach((el) => (el.hidden = m !== 'signin'));
    $('#submit', app).textContent = m === 'signup' ? 'Create account' : 'Sign in';
    form.password.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    err.hidden = true;
  };
  setMode(mode);
  $$('[data-tab]', app).forEach((b) => (b.onclick = () => setMode(b.dataset.tab)));
  const fail = (e) => {
    err.textContent = friendlyError(e);
    err.hidden = false;
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(new Error('Enter a valid email address.'));
    if (password.length < 8) return fail(new Error('Password must be at least 8 characters.'));
    const btn = $('#submit', app);
    btn.disabled = true;
    try {
      if (current === 'signup') {
        const { needsConfirmation } = await cloud.signUp({ email, password, name: form.name.value.trim() });
        if (needsConfirmation) {
          app.querySelector('.auth-card').innerHTML = `
            <h2>Check your email</h2>
            <p>We sent a confirmation link to <b>${esc(email)}</b>. Open it on this device to finish creating your account.</p>
            <p class="muted small">Your sets stay available here in the meantime.</p>`;
          return;
        }
        toast('Account created — your sets are syncing');
      } else {
        await cloud.signIn({ email, password });
        toast('Signed in');
      }
    } catch (e2) {
      fail(e2);
    } finally {
      btn.disabled = false;
    }
  };

  $('#forgot', app).onclick = async () => {
    const email = form.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(new Error('Enter your email above first, then click “Forgot password?”.'));
    try {
      await cloud.sendPasswordReset(email);
      toast('If that email has an account, a reset link is on its way.');
    } catch (e) {
      fail(e);
    }
  };

  $$('[data-provider]', app).forEach(
    (b) =>
      (b.onclick = () =>
        cloud.signInWithProvider(b.dataset.provider).catch(fail))
  );
}

function resetForm(app, go) {
  app.innerHTML = `
    <div class="page auth-page">
      <form class="auth-card panel" id="reset">
        <h2>Choose a new password</h2>
        <label class="field">New password <input class="input" name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <p class="error" id="err" role="alert" hidden></p>
        <button class="btn primary lg">Save password</button>
      </form>
    </div>`;
  const form = $('#reset', app);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#err', app);
    if (form.password.value.length < 8) {
      err.textContent = 'Password must be at least 8 characters.';
      err.hidden = false;
      return;
    }
    try {
      await cloud.updatePassword(form.password.value);
      toast('Password updated');
      go('/account');
    } catch (e2) {
      err.textContent = friendlyError(e2);
      err.hidden = false;
    }
  };
}

function profile(app, user, go) {
  app.innerHTML = `
    <div class="page narrow" id="profile">
      <a class="back" href="#/">← Back</a>
      <div class="profile-head">
        <span class="avatar lg">${esc(initials(cloud.displayName(user)))}</span>
        <div>
          <h1>${esc(cloud.displayName(user))}</h1>
          <p class="muted">${esc(user.email || '')}</p>
        </div>
      </div>

      <section class="panel" id="sync-panel"></section>

      <section class="panel">
        <h3>Profile</h3>
        <form class="row gap wrap" id="name-form">
          <input class="input" name="name" value="${esc(user.user_metadata?.display_name || '')}" placeholder="Display name" style="flex:1;min-width:200px">
          <button class="btn">Save</button>
        </form>
        <form class="row gap wrap" id="pw-form">
          <input class="input" name="password" type="password" minlength="8" autocomplete="new-password" placeholder="New password (8+ characters)" style="flex:1;min-width:200px">
          <button class="btn">Change password</button>
        </form>
      </section>

      <section class="panel">
        <h3>Sign out</h3>
        <label class="check"><input type="checkbox" id="clear-device"> Also remove my sets from this device (recommended on shared computers)</label>
        <div><button class="btn" id="signout">Sign out</button></div>
      </section>

      <section class="panel danger-zone">
        <h3>Delete account</h3>
        <p class="muted small">Permanently deletes your account and every set stored in it. Sets on this device stay until you remove them in Settings.</p>
        <div><button class="btn danger" id="delete">Delete my account…</button></div>
      </section>
    </div>`;

  updateSyncPanel(app);

  $('#name-form', app).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await cloud.updateProfile({ name: e.target.name.value.trim() });
      toast('Profile saved');
      profile(app, cloud.getUser(), go);
    } catch (e2) {
      toast(friendlyError(e2));
    }
  };
  $('#pw-form', app).onsubmit = async (e) => {
    e.preventDefault();
    const pw = e.target.password.value;
    if (pw.length < 8) return toast('Password must be at least 8 characters.');
    try {
      await cloud.updatePassword(pw);
      e.target.reset();
      toast('Password changed');
    } catch (e2) {
      toast(friendlyError(e2));
    }
  };
  $('#signout', app).onclick = async () => {
    await cloud.signOut({ clearDevice: $('#clear-device', app).checked });
    toast('Signed out');
    go('/');
  };
  $('#delete', app).onclick = async () => {
    const typed = prompt('This permanently deletes your account and all synced sets.\nType DELETE to confirm.');
    if (typed !== 'DELETE') return;
    try {
      await cloud.deleteAccount();
      toast('Account deleted');
      go('/');
    } catch (e) {
      toast(friendlyError(e));
    }
  };
}

function updateSyncPanel(app) {
  const panel = $('#sync-panel', app);
  if (!panel) return;
  const { state, lastSync, error } = cloud.getStatus();
  const label = {
    syncing: 'Syncing…',
    idle: 'All sets backed up',
    error: 'Sync problem',
    offline: 'Offline — will sync when you reconnect',
  }[state] || state;
  panel.innerHTML = `
    <h3>Sync</h3>
    <div class="row between wrap">
      <div>
        <div class="sync-state ${state}"><i class="sync-dot"></i> <b>${esc(label)}</b></div>
        <p class="muted small">${plural(store.listSets().length, 'set')} · last synced ${lastSync ? timeAgo(lastSync) : 'not yet'}${
          error ? ` · <span class="error-text">${esc(error)}</span>` : ''
        }</p>
      </div>
      <button class="btn" id="sync-now" ${state === 'syncing' ? 'disabled' : ''}>Sync now</button>
    </div>`;
  $('#sync-now', panel).onclick = () => cloud.sync();
}

export function initials(name) {
  return (
    String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'
  );
}

function friendlyError(e) {
  const msg = e?.message || String(e);
  if (/invalid login credentials/i.test(msg)) return 'Email or password is incorrect.';
  if (/already registered|already exists/i.test(msg)) return 'An account with that email already exists — try signing in.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/failed to fetch|network/i.test(msg)) return 'Can’t reach the server. Check your connection.';
  return msg;
}
