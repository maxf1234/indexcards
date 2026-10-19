import * as store from './store.js';
import { APP_NAME } from './config.js';
import { esc, fmt, plural, timeAgo, toast, download, slug, $, $$ } from './util.js';
import { parseText, parseCSV, detectSeparators, resolveSep, toCSV, toTSV, encodeShare, decodeShare } from './io.js';
import { isDue, masteryOf } from './srs.js';
import { speak } from './speech.js';
import * as cloud from './cloud.js';
import { CLOUD } from './cloud-config.js';
import { renderAccount, initials } from './account.js';
import flashcards from './modes/flashcards.js';
import learn from './modes/learn.js';
import write from './modes/write.js';
import test from './modes/test.js';
import match from './modes/match.js';
import review from './modes/review.js';

const MODES = {
  review: { label: 'Review (spaced)', icon: '🧠', run: review, blurb: 'Only what\'s due. Remember it for months.' },
  flashcards: { label: 'Flashcards', icon: '🗂️', run: flashcards, blurb: 'Flip, sort into know / still learning.' },
  learn: { label: 'Learn', icon: '🎯', run: learn, blurb: 'Adaptive rounds until you\'ve got it.' },
  write: { label: 'Write', icon: '⌨️', run: write, blurb: 'Type answers, typo-tolerant.' },
  test: { label: 'Test', icon: '📝', run: test, blurb: 'Practice exam, graded instantly.' },
  match: { label: 'Match', icon: '⚡', run: match, blurb: 'Race the clock pairing cards.' },
};

const app = document.getElementById('app');
let cleanup = null;

// ---------- Theme ----------
function applyTheme() {
  const t = store.getSettings().theme;
  document.documentElement.dataset.theme =
    t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------- Router ----------
function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}

export function go(path) {
  location.hash = path;
}

async function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  window.scrollTo(0, 0);
  const { parts, query } = parseHash();
  const [a, b, c] = parts;
  try {
    if (!a) return renderHome();
    if (a === 'new') return renderEditor(null);
    if (a === 'import') return renderImport();
    if (a === 'settings') return renderSettings();
    if (a === 'account') return (cleanup = renderAccount(app, query, { go, providers: CLOUD.oauthProviders }));
    if (a === 'about') return renderAbout();
    if (a === 's') return renderShared(b);
    if (a === 'set' && b) {
      const set = store.getSet(b);
      if (!set) return renderNotFound();
      if (!c) return renderSet(set);
      if (c === 'edit') return renderEditor(set);
      if (MODES[c]) return renderMode(set, c, query);
    }
    renderNotFound();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="page"><h1>Something went wrong</h1><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Home</a></div>`;
  }
}

window.addEventListener('hashchange', route);

// Another device's changes arrived: refresh browse screens, never interrupt
// a study session or the editor.
window.addEventListener('ic:remote-change', () => {
  const [a, , c] = parseHash().parts;
  if (!a || (a === 'set' && !c)) route();
});

// ---------- Account link in the nav ----------
function updateAccountLink() {
  const link = document.getElementById('account-link');
  if (!cloud.configured()) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  const user = cloud.getUser();
  if (!user) {
    link.className = 'account-link';
    link.textContent = 'Sign in';
    link.title = 'Sign in to sync across devices';
    return;
  }
  const { state } = cloud.getStatus();
  link.className = `account-link signed-in sync-state ${state}`;
  link.title = `${cloud.displayName(user)} — ${state === 'idle' ? 'synced' : state}`;
  link.innerHTML = `<span class="avatar">${esc(initials(cloud.displayName(user)))}</span><i class="sync-dot"></i>`;
}
cloud.onChange(updateAccountLink);

// ---------- Views ----------
function renderNotFound() {
  app.innerHTML = `<div class="page empty"><h1>Not found</h1><p class="muted">That set doesn't exist on this device.</p><a class="btn primary" href="#/">Go home</a></div>`;
}

function dueCount(set) {
  return set.cards.filter((c) => isDue(c)).length;
}

function renderHome() {
  const sets = store.listSets();
  const stats = store.getStats();
  const totalDue = sets.reduce((n, s) => n + dueCount(s), 0);
  const q = sessionStorage.getItem('ic:search') || '';

  if (!sets.length) {
    app.innerHTML = `
      <section class="hero">
        <h1>Study smarter. <span class="accent">Pay nothing.</span></h1>
        <p class="lead">Flashcards, Learn, Write, Test, Match and real spaced repetition — every mode, unlimited, no ads, no account.</p>
        <div class="hero-actions">
          <a class="btn primary lg" href="#/new">Create a set</a>
          <a class="btn lg" href="#/import">Import from Quizlet</a>
          <button class="btn lg ghost" id="demo">Try a demo set</button>
        </div>
        <ul class="pillars">
          <li><b>No round limits.</b> Learn and Test as many times as you want.</li>
          <li><b>Your data is yours.</b> Export to CSV / TSV / JSON any time.</li>
          <li><b>Works offline.</b> Install it like an app.</li>
          <li><b>Share with a link.</b> Nothing to sign up for.</li>
        </ul>
      </section>`;
    $('#demo').onclick = () => {
      const set = store.saveSet(DEMO_SET);
      go(`/set/${set.id}`);
    };
    return;
  }

  app.innerHTML = `
    <div class="page">
      <div class="home-head">
        <div>
          <h1>Your sets</h1>
          <p class="muted">${plural(sets.length, 'set')} · ${stats.streak ? `🔥 ${plural(stats.streak, 'day')} streak` : 'Start a streak today'}</p>
        </div>
        <div class="row">
          <a class="btn" href="#/import">Import</a>
          <a class="btn primary" href="#/new">+ New set</a>
        </div>
      </div>
      ${totalDue ? `<div class="due-banner"><span>🧠 <b>${totalDue}</b> cards due for review across your sets</span></div>` : ''}
      <input class="search" id="search" type="search" placeholder="Search sets and cards…" value="${esc(q)}">
      <div class="grid" id="sets"></div>
    </div>`;

  const list = $('#sets');
  const draw = (term) => {
    const t = term.toLowerCase();
    const filtered = sets.filter(
      (s) =>
        !t ||
        s.title.toLowerCase().includes(t) ||
        (s.folder || '').toLowerCase().includes(t) ||
        s.cards.some((c) => c.term.toLowerCase().includes(t) || c.definition.toLowerCase().includes(t))
    );
    list.innerHTML = filtered.length
      ? filtered
          .map((s) => {
            const due = dueCount(s);
            return `
            <a class="set-card" href="#/set/${s.id}">
              ${s.folder ? `<span class="folder">${esc(s.folder)}</span>` : ''}
              <h3>${esc(s.title)}</h3>
              <p class="muted">${plural(s.cards.length, 'term')} · studied ${timeAgo(s.lastStudied)}</p>
              ${due ? `<span class="badge">${due} due</span>` : '<span class="badge ok">all caught up</span>'}
            </a>`;
          })
          .join('')
      : `<p class="muted">No sets match “${esc(term)}”.</p>`;
  };
  draw(q);
  $('#search').addEventListener('input', (e) => {
    sessionStorage.setItem('ic:search', e.target.value);
    draw(e.target.value);
  });
}

function renderSet(set) {
  const counts = { new: 0, learning: 0, mastered: 0 };
  set.cards.forEach((c) => counts[masteryOf(c)]++);
  const due = dueCount(set);
  const starred = set.cards.filter((c) => c.starred).length;
  const total = set.cards.length || 1;

  app.innerHTML = `
    <div class="page">
      <a class="back" href="#/">← All sets</a>
      <div class="set-head">
        <div>
          ${set.folder ? `<span class="folder">${esc(set.folder)}</span>` : ''}
          <h1>${esc(set.title)}</h1>
          ${set.description ? `<p class="muted">${fmt(set.description)}</p>` : ''}
          <p class="muted small">${plural(set.cards.length, 'term')}</p>
        </div>
        <div class="row wrap">
          <a class="btn" href="#/set/${set.id}/edit">Edit</a>
          <button class="btn" id="share">Share</button>
          <div class="menu">
            <button class="btn" id="more">⋯</button>
            <div class="menu-list" hidden>
              <button data-act="tsv">Export TSV (Quizlet/Anki)</button>
              <button data-act="csv">Export CSV</button>
              <button data-act="json">Export JSON</button>
              <button data-act="print">Print cards</button>
              <button data-act="dup">Duplicate</button>
              <button data-act="reset">Reset progress</button>
              <button data-act="del" class="danger">Delete set</button>
            </div>
          </div>
        </div>
      </div>

      <div class="mastery">
        <div class="bar">
          <span class="m-mastered" style="width:${(counts.mastered / total) * 100}%"></span>
          <span class="m-learning" style="width:${(counts.learning / total) * 100}%"></span>
        </div>
        <div class="legend small">
          <span><i class="dot m-mastered"></i>${counts.mastered} mastered</span>
          <span><i class="dot m-learning"></i>${counts.learning} learning</span>
          <span><i class="dot"></i>${counts.new} new</span>
          <span>🧠 ${due} due now</span>
        </div>
      </div>

      <div class="options">
        <label>Answer with
          <select id="dir">
            <option value="def">Definition</option>
            <option value="term">Term</option>
            <option value="mix">Both (mixed)</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" id="starredOnly" ${starred ? '' : 'disabled'}> Starred only (${starred})</label>
      </div>

      <div class="modes">
        ${Object.entries(MODES)
          .map(
            ([key, m]) => `
          <a class="mode" data-mode="${key}" href="#/set/${set.id}/${key}">
            <span class="icon">${m.icon}</span>
            <span><b>${m.label}</b>${key === 'review' && due ? ` <span class="badge">${due}</span>` : ''}<br><span class="muted small">${m.blurb}</span></span>
          </a>`
          )
          .join('')}
      </div>

      <h2>Terms</h2>
      <ul class="term-list">
        ${set.cards
          .map(
            (c) => `
          <li data-id="${c.id}">
            <div class="t">${fmt(c.term)}</div>
            <div class="d">${fmt(c.definition)}</div>
            <div class="acts">
              <span class="pill ${masteryOf(c)}">${masteryOf(c)}</span>
              <button class="icon-btn speak" title="Read aloud">🔊</button>
              <button class="icon-btn star ${c.starred ? 'on' : ''}" title="Star">${c.starred ? '★' : '☆'}</button>
            </div>
          </li>`
          )
          .join('')}
      </ul>
    </div>`;

  const optsKey = `ic:opts:${set.id}`;
  const saved = JSON.parse(sessionStorage.getItem(optsKey) || '{}');
  if (saved.dir) $('#dir').value = saved.dir;
  if (saved.starred && starred) $('#starredOnly').checked = true;
  const opts = () => ({ dir: $('#dir').value, starred: $('#starredOnly').checked });
  $$('.options select, .options input').forEach((el) =>
    el.addEventListener('change', () => sessionStorage.setItem(optsKey, JSON.stringify(opts())))
  );
  $$('.mode').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const o = opts();
      const qs = new URLSearchParams({ dir: o.dir });
      if (o.starred) qs.set('starred', '1');
      go(`/set/${set.id}/${a.dataset.mode}?${qs}`);
    })
  );

  $$('.term-list li').forEach((li) => {
    const card = set.cards.find((c) => c.id === li.dataset.id);
    $('.star', li).onclick = () => {
      store.updateCard(set.id, card.id, { starred: !card.starred });
      renderSet(store.getSet(set.id));
    };
    $('.speak', li).onclick = () => speak(`${card.term}. ${card.definition}`);
  });

  $('#share').onclick = async () => {
    const code = await encodeShare(set);
    const url = `${location.origin}${location.pathname}#/s/${code}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: set.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('Share link copied — anyone with it can study or save a copy.');
    } catch {
      prompt('Copy this link:', url);
    }
  };

  const menu = $('.menu-list');
  $('#more').onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  const closeMenu = () => (menu.hidden = true);
  document.addEventListener('click', closeMenu);
  cleanup = () => document.removeEventListener('click', closeMenu);

  menu.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    const name = slug(set.title);
    if (act === 'tsv') download(`${name}.txt`, toTSV(set));
    if (act === 'csv') download(`${name}.csv`, toCSV(set), 'text/csv');
    if (act === 'json') download(`${name}.json`, JSON.stringify(set, null, 2), 'application/json');
    if (act === 'print') printSet(set);
    if (act === 'dup') {
      const copy = store.saveSet({ ...set, id: null, title: `${set.title} (copy)`, cards: set.cards.map((c) => ({ ...c, id: null, srs: null })) });
      go(`/set/${copy.id}`);
    }
    if (act === 'reset' && confirm('Reset all study progress for this set?')) {
      store.saveSet({ ...set, cards: set.cards.map((c) => ({ ...c, srs: null })) });
      renderSet(store.getSet(set.id));
      toast('Progress reset');
    }
    if (act === 'del' && confirm(`Delete “${set.title}”? This can't be undone.`)) {
      store.deleteSet(set.id);
      go('/');
    }
  });
}

function printSet(set) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print');
  w.document.write(`<!doctype html><title>${esc(set.title)}</title>
    <style>body{font-family:system-ui;margin:0}.g{display:grid;grid-template-columns:1fr 1fr;}
    .c{border:1px dashed #999;height:2.5in;display:flex;align-items:center;justify-content:center;text-align:center;padding:.3in;box-sizing:border-box;font-size:18px;break-inside:avoid}
    h1{font-size:16px;padding:8px}</style>
    <h1>${esc(set.title)} — fold along the middle line</h1>
    <div class="g">${set.cards.map((c) => `<div class="c">${fmt(c.term)}</div><div class="c">${fmt(c.definition)}</div>`).join('')}</div>
    <script>print()<\/script>`);
  w.document.close();
}

function renderEditor(set) {
  const draftKey = 'ic:draft';
  // New sets restore an unsaved draft so a refresh never loses work.
  const initial = (set
    ? { title: set.title, description: set.description, folder: set.folder || '', cards: set.cards.map((c) => ({ ...c })) }
    : JSON.parse(sessionStorage.getItem(draftKey) || 'null')) || { title: '', description: '', folder: '', cards: [] };
  while (initial.cards.length < 3) initial.cards.push(store.makeCard());

  app.innerHTML = `
    <div class="page narrow">
      <a class="back" href="${set ? `#/set/${set.id}` : '#/'}">← Back</a>
      <div class="editor-head">
        <h1>${set ? 'Edit set' : 'Create a new set'}</h1>
        <div class="row">
          ${set ? '' : '<a class="btn" href="#/import">Import</a>'}
          <button class="btn primary" id="save">${set ? 'Save' : 'Create'}</button>
        </div>
      </div>
      <input class="input big" id="title" placeholder="Title, e.g. “Biology — Chapter 3: Cells”" value="${esc(initial.title)}">
      <div class="row gap">
        <textarea class="input" id="desc" rows="2" placeholder="Description (optional)">${esc(initial.description)}</textarea>
        <input class="input folder-input" id="folder" placeholder="Folder / class (optional)" value="${esc(initial.folder)}" list="folders">
        <datalist id="folders">${[...new Set(store.listSets().map((s) => s.folder).filter(Boolean))].map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
      </div>
      <div class="row between small muted toolbar">
        <span>Tip: press <kbd>Tab</kbd> in the last definition to add a card. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> saves.</span>
        <button class="btn ghost sm" id="swap">⇄ Swap terms & definitions</button>
      </div>
      <ol class="editor" id="cards"></ol>
      <button class="btn add-card" id="add">+ Add card</button>
      <div class="row end"><button class="btn primary lg" id="save2">${set ? 'Save' : 'Create'}</button></div>
    </div>`;

  const list = $('#cards');
  const cardRow = (c) => {
    const li = document.createElement('li');
    li.className = 'edit-card';
    li.dataset.id = c.id || '';
    li._card = c;
    li.innerHTML = `
      <div class="num"></div>
      <textarea class="input term" rows="1" placeholder="Term">${esc(c.term)}</textarea>
      <textarea class="input def" rows="1" placeholder="Definition">${esc(c.definition)}</textarea>
      <div class="edit-acts">
        <button class="icon-btn up" title="Move up" tabindex="-1">↑</button>
        <button class="icon-btn down" title="Move down" tabindex="-1">↓</button>
        <button class="icon-btn del" title="Delete" tabindex="-1">✕</button>
      </div>`;
    $('.del', li).onclick = () => {
      li.remove();
      renumber();
      saveDraft();
    };
    $('.up', li).onclick = () => li.previousElementSibling && list.insertBefore(li, li.previousElementSibling) && renumber();
    $('.down', li).onclick = () => li.nextElementSibling && list.insertBefore(li.nextElementSibling, li) && renumber();
    $$('textarea', li).forEach((ta) => {
      autosize(ta);
      ta.addEventListener('input', () => {
        autosize(ta);
        saveDraft();
      });
    });
    $('.def', li).addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && li === list.lastElementChild) {
        e.preventDefault();
        addCard();
      }
    });
    return li;
  };
  const renumber = () => $$('.edit-card', list).forEach((li, i) => ($('.num', li).textContent = i + 1));
  const addCard = (focus = true) => {
    const li = cardRow(store.makeCard());
    list.appendChild(li);
    renumber();
    if (focus) $('.term', li).focus();
  };
  initial.cards.forEach((c) => list.appendChild(cardRow(c)));
  renumber();

  const collect = () => ({
    title: $('#title').value,
    description: $('#desc').value,
    folder: $('#folder').value,
    cards: $$('.edit-card', list)
      .map((li) => ({
        ...li._card,
        term: $('.term', li).value.trim(),
        definition: $('.def', li).value.trim(),
      }))
      .filter((c) => c.term || c.definition),
  });
  const saveDraft = () => {
    if (!set) sessionStorage.setItem(draftKey, JSON.stringify(collect()));
  };
  ['#title', '#desc', '#folder'].forEach((s) => $(s).addEventListener('input', saveDraft));

  $('#add').onclick = () => addCard();
  $('#swap').onclick = () => {
    $$('.edit-card', list).forEach((li) => {
      const t = $('.term', li);
      const d = $('.def', li);
      [t.value, d.value] = [d.value, t.value];
      autosize(t);
      autosize(d);
    });
    saveDraft();
  };
  const save = () => {
    const data = collect();
    if (data.cards.length < 1) return toast('Add at least one card');
    if (!data.title.trim()) {
      $('#title').focus();
      return toast('Give your set a title');
    }
    const saved = store.saveSet({ ...data, id: set?.id });
    sessionStorage.removeItem(draftKey);
    go(`/set/${saved.id}`);
  };
  $('#save').onclick = save;
  $('#save2').onclick = save;
  const onKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => document.removeEventListener('keydown', onKey);
  if (!set) $('#title').focus();
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function renderImport() {
  app.innerHTML = `
    <div class="page narrow">
      <a class="back" href="#/">← Back</a>
      <h1>Import</h1>
      <div class="callout">
        <b>Moving from Quizlet?</b> Open your set → <i>⋯</i> → <i>Export</i> → <i>Copy text</i>, then paste below.
        The default “Tab / New line” format matches Quizlet exactly. Anki “Notes in plain text” works too.
      </div>
      <input class="input big" id="title" placeholder="Set title">
      <textarea class="input mono" id="text" rows="10" placeholder="Paste here, one card per line:\nmitochondria\tpowerhouse of the cell\nribosome\tmakes proteins"></textarea>
      <div class="row wrap gap">
        <label>Between term and definition
          <select id="termSep">
            <option value="tab">Tab</option><option value="comma">Comma</option>
            <option value="dash">Dash ( - )</option><option value="colon">Colon</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        <input class="input sm" id="termCustom" placeholder="custom" hidden>
        <label>Between cards
          <select id="cardSep">
            <option value="newline">New line</option><option value="semicolon">Semicolon</option>
            <option value="blankline">Blank line</option><option value="custom">Custom…</option>
          </select>
        </label>
        <input class="input sm" id="cardCustom" placeholder="custom" hidden>
        <label class="file-btn btn">Upload CSV / TXT / JSON<input type="file" id="file" accept=".csv,.txt,.tsv,.json" hidden></label>
      </div>
      <h3 id="previewTitle">Preview</h3>
      <ol class="preview" id="preview"><li class="muted">Nothing yet.</li></ol>
      <div class="row end"><button class="btn primary lg" id="go" disabled>Import</button></div>
    </div>`;

  let cards = [];
  let manualSep = false;
  const update = () => {
    const text = $('#text').value;
    if (!manualSep && text) {
      const d = detectSeparators(text);
      $('#termSep').value = d.term;
      $('#cardSep').value = d.card;
    }
    $('#termCustom').hidden = $('#termSep').value !== 'custom';
    $('#cardCustom').hidden = $('#cardSep').value !== 'custom';
    cards = parseText(
      text,
      resolveSep($('#termSep').value, $('#termCustom').value),
      resolveSep($('#cardSep').value, $('#cardCustom').value)
    );
    showPreview();
  };
  const showPreview = () => {
    $('#previewTitle').textContent = `Preview (${plural(cards.length, 'card')})`;
    $('#preview').innerHTML = cards.length
      ? cards
          .slice(0, 50)
          .map((c) => `<li><span>${esc(c.term)}</span><span>${esc(c.definition) || '<i class="muted">no definition</i>'}</span></li>`)
          .join('') + (cards.length > 50 ? `<li class="muted">…and ${cards.length - 50} more</li>` : '')
      : '<li class="muted">Nothing yet.</li>';
    $('#go').disabled = !cards.length;
  };
  $('#text').addEventListener('input', update);
  ['#termSep', '#cardSep', '#termCustom', '#cardCustom'].forEach((s) =>
    $(s).addEventListener('input', () => {
      manualSep = true;
      update();
    })
  );
  $('#file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    if (!$('#title').value) $('#title').value = f.name.replace(/\.[^.]+$/, '');
    if (f.name.endsWith('.json')) {
      try {
        const data = JSON.parse(text);
        if (data.sets) {
          const n = store.importBackup(text);
          toast(`Restored ${plural(n, 'set')} from backup`);
          return go('/');
        }
        cards = (data.cards || []).map((c) => ({ term: c.term, definition: c.definition }));
        if (data.title && !$('#title').value) $('#title').value = data.title;
      } catch {
        return toast('That JSON file could not be read');
      }
      showPreview();
    } else if (f.name.endsWith('.csv')) {
      cards = parseCSV(text);
      showPreview();
    } else {
      $('#text').value = text;
      update();
    }
  });
  $('#go').onclick = () => {
    const set = store.saveSet({ title: $('#title').value || 'Imported set', cards });
    toast(`Imported ${plural(cards.length, 'card')}`);
    go(`/set/${set.id}`);
  };
}

async function renderShared(code) {
  app.innerHTML = '<div class="page"><p class="muted">Opening shared set…</p></div>';
  let data;
  try {
    data = await decodeShare(code);
  } catch (e) {
    app.innerHTML = '<div class="page empty"><h1>Broken link</h1><p class="muted">This share link is incomplete or corrupted.</p><a class="btn" href="#/">Home</a></div>';
    return;
  }
  app.innerHTML = `
    <div class="page narrow">
      <p class="muted small">Shared with you</p>
      <h1>${esc(data.title)}</h1>
      ${data.description ? `<p class="muted">${fmt(data.description)}</p>` : ''}
      <div class="row gap"><button class="btn primary lg" id="save">Save & study (${plural(data.cards.length, 'card')})</button></div>
      <ul class="term-list">${data.cards.map((c) => `<li><div class="t">${fmt(c.term)}</div><div class="d">${fmt(c.definition)}</div></li>`).join('')}</ul>
    </div>`;
  $('#save').onclick = () => {
    const set = store.saveSet(data);
    go(`/set/${set.id}`);
  };
}

function renderSettings() {
  const s = store.getSettings();
  app.innerHTML = `
    <div class="page narrow">
      <a class="back" href="#/">← Back</a>
      <h1>Settings</h1>
      <section class="panel">
        <h3>Appearance</h3>
        <label>Theme
          <select id="theme">
            <option value="auto">Match system</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" id="audio" ${s.audio ? 'checked' : ''}> Read cards aloud automatically in Flashcards</label>
      </section>
      <section class="panel">
        <h3>Your data</h3>
        <p class="muted small">${
          cloud.getUser()
            ? `Signed in as ${esc(cloud.getUser().email || '')} — your sets are backed up to your account. <a href="#/account">Manage account</a>`
            : `Your sets are stored in this browser.${cloud.configured() ? ' <a href="#/account">Sign in</a> to back them up and sync across devices, or' : ''} Download a backup to keep a copy.`
        }</p>
        <div class="row wrap gap">
          <button class="btn" id="backup">Download backup</button>
          <label class="btn file-btn">Restore backup<input type="file" id="restore" accept=".json" hidden></label>
          <button class="btn danger" id="wipe">Delete everything</button>
        </div>
      </section>
      <section class="panel">
        <h3>Keyboard shortcuts</h3>
        <table class="shortcuts">
          <tr><td><kbd>Space</kbd></td><td>Flip card</td></tr>
          <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Previous / next card</td></tr>
          <tr><td><kbd>1</kbd>–<kbd>4</kbd></td><td>Pick an answer / rate a review</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Submit / continue</td></tr>
          <tr><td><kbd>S</kbd></td><td>Star current card</td></tr>
        </table>
      </section>
    </div>`;
  $('#theme').value = s.theme;
  $('#theme').onchange = (e) => {
    store.updateSettings({ theme: e.target.value });
    applyTheme();
  };
  $('#audio').onchange = (e) => store.updateSettings({ audio: e.target.checked });
  $('#backup').onclick = () =>
    download(`indexcards-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup(), 'application/json');
  $('#restore').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const n = store.importBackup(await f.text());
      toast(`Restored ${plural(n, 'set')}`);
    } catch (err) {
      toast(err.message);
    }
  };
  $('#wipe').onclick = () => {
    const msg = cloud.getUser()
      ? 'Remove all sets from THIS DEVICE? Your account copy is kept and will sync back.'
      : 'Delete ALL sets and progress on this device?';
    if (confirm(msg) && confirm('Really? Download a backup first if unsure.')) {
      store.resetAll();
      cloud.sync();
      go('/');
    }
  };
}

function renderAbout() {
  app.innerHTML = `
    <div class="page narrow prose">
      <a class="back" href="#/">← Back</a>
      <h1>Why ${APP_NAME}?</h1>
      <p>Studying shouldn't stop the night before an exam because you ran out of free “rounds”.</p>
      <table class="compare">
        <thead><tr><th></th><th>${APP_NAME}</th><th>Typical alternatives</th></tr></thead>
        <tbody>
          <tr><td>Learn / Test / Write modes</td><td>✅ Unlimited, free</td><td>A few free rounds, then a subscription</td></tr>
          <tr><td>Spaced repetition</td><td>✅ Built in</td><td>Often missing or paid</td></tr>
          <tr><td>Ads while studying</td><td>✅ Never</td><td>Common on free tiers</td></tr>
          <tr><td>Export your cards</td><td>✅ CSV, TSV, JSON, print</td><td>Limited or hidden</td></tr>
          <tr><td>Account required</td><td>✅ No — optional, free, for syncing</td><td>Yes</td></tr>
          <tr><td>Works offline</td><td>✅ Yes</td><td>Paid feature</td></tr>
          <tr><td>Typo-tolerant grading</td><td>✅ Yes, plus “I was right” override</td><td>Varies</td></tr>
        </tbody>
      </table>
      <h2>Our promise</h2>
      <p>Making sets and every study mode will stay free, unlimited and ad-free. If we ever charge, it will be for
      things that cost real money to run — like cloud sync across devices, AI card generation, or classroom tools —
      never for the basics you rely on today.</p>
      <h2>Your privacy</h2>
      <p>No account, no tracking. Your sets live in your browser. Share links contain the set itself, so nothing is uploaded to a server.</p>
    </div>`;
}

function renderMode(set, mode, query) {
  let cards = set.cards.filter((c) => c.term || c.definition);
  if (query.get('starred') === '1') {
    const s = cards.filter((c) => c.starred);
    if (s.length) cards = s;
  }
  if (!cards.length) {
    app.innerHTML = `<div class="page empty"><h1>No cards</h1><a class="btn" href="#/set/${set.id}/edit">Add some</a></div>`;
    return;
  }
  const dir = query.get('dir') || 'def';
  // prompt/answer accessors honour the "answer with" option.
  const sides = (card) => {
    const answerTerm = dir === 'term' || (dir === 'mix' && hashCode(card.id) % 2 === 0);
    return answerTerm
      ? { prompt: card.definition, answer: card.term, promptLabel: 'Definition', answerLabel: 'Term' }
      : { prompt: card.term, answer: card.definition, promptLabel: 'Term', answerLabel: 'Definition' };
  };

  app.innerHTML = `
    <div class="study">
      <header class="study-bar">
        <a class="icon-btn close" href="#/set/${set.id}" title="Exit (Esc)">✕</a>
        <div class="study-title"><span>${MODES[mode].icon} ${MODES[mode].label}</span><small class="muted">${esc(set.title)}</small></div>
        <div class="study-progress" id="progress"></div>
      </header>
      <main class="study-main" id="stage"></main>
    </div>`;
  store.touchStudied(set.id);

  const onEsc = (e) => {
    if (e.key === 'Escape' && !e.target.closest('input,textarea')) go(`/set/${set.id}`);
  };
  document.addEventListener('keydown', onEsc);
  const modeCleanup = MODES[mode].run({
    set,
    cards,
    sides,
    stage: $('#stage'),
    progress: $('#progress'),
    store,
    exit: () => go(`/set/${set.id}`),
    restart: () => route(),
  });
  cleanup = () => {
    document.removeEventListener('keydown', onEsc);
    if (typeof modeCleanup === 'function') modeCleanup();
    speechSynthesis?.cancel?.();
  };
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const DEMO_SET = {
  title: 'World Capitals (demo)',
  description: 'A quick set to try every study mode.',
  folder: 'Geography',
  cards: [
    ['France', 'Paris'],
    ['Japan', 'Tokyo'],
    ['Canada', 'Ottawa'],
    ['Australia', 'Canberra'],
    ['Brazil', 'Brasília'],
    ['Egypt', 'Cairo'],
    ['Kenya', 'Nairobi'],
    ['Germany', 'Berlin'],
    ['India', 'New Delhi'],
    ['Argentina', 'Buenos Aires'],
    ['South Korea', 'Seoul'],
    ['Norway', 'Oslo'],
  ].map(([term, definition]) => store.makeCard(term, definition)),
};

// ---------- Boot ----------
document.getElementById('brand').textContent = APP_NAME;
updateAccountLink();
route();
cloud.init().catch((e) => console.warn('Accounts unavailable:', e));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
