// Review: spaced repetition. Shows only cards that are due, then schedules each
// one further out the better you know it.

import { fmt, shuffle, progressBar, finishScreen } from './common.js';
import { RATINGS, schedule, isDue, isNew, previewInterval, humanDuration } from '../srs.js';
import { speak } from '../speech.js';

const NEW_PER_SESSION = 20;

export default function review({ set, cards, sides, stage, progress, store, exit, restart }) {
  const now = Date.now();
  const dueOld = cards.filter((c) => !isNew(c) && isDue(c, now));
  const dueNew = cards.filter((c) => isNew(c) && isDue(c, now)).slice(0, NEW_PER_SESSION);
  let queue = [...shuffle(dueOld), ...shuffle(dueNew)];
  const total = queue.length;
  let done = 0;
  let flipped = false;
  let counts = { again: 0, hard: 0, good: 0, easy: 0 };
  let timer = null;

  function render() {
    clearTimeout(timer);
    if (!queue.length) return finish();
    // Cards rated "Again" are due in a minute; wait for them if nothing else is left.
    const card = queue[0];
    if (card.srs?.due > Date.now() && queue.every((c) => c.srs?.due > Date.now())) {
      const wait = Math.min(...queue.map((c) => c.srs.due)) - Date.now();
      stage.innerHTML = `<div class="finish"><h2>Almost done</h2><p class="muted">${queue.length} card(s) coming back in ${humanDuration(wait)}.</p>
        <div class="row center gap"><button class="btn primary" id="now">Review now</button><button class="btn" id="stop">Finish</button></div></div>`;
      stage.querySelector('#now').onclick = () => {
        queue.forEach((c) => (c.srs.due = 0));
        render();
      };
      stage.querySelector('#stop').onclick = finish;
      timer = setTimeout(render, wait + 50);
      return;
    }
    const s = sides(card);
    progressBar(progress, done, total, `${done} / ${total} reviewed`);
    stage.innerHTML = `
      <div class="fc-wrap">
        <div class="fc ${flipped ? 'flipped' : ''}" id="fc" tabindex="0">
          <div class="fc-face front"><small>${s.promptLabel}${isNew(card) ? ' · new' : ''}</small><div class="fc-text">${fmt(s.prompt)}</div></div>
          <div class="fc-face back"><small>${s.answerLabel}</small><div class="fc-text">${fmt(s.answer)}</div></div>
        </div>
        <div class="fc-tools"><button class="icon-btn" id="speak" title="Read aloud">🔊</button></div>
        ${
          flipped
            ? `<div class="ratings">${RATINGS.map(
                (r) => `<button class="btn rate ${r.key}" data-r="${r.key}"><b>${r.label}</b><small>${previewInterval(card.srs, r.key)}</small><kbd>${r.hotkey}</kbd></button>`
              ).join('')}</div>`
            : `<div class="row center"><button class="btn primary lg" id="show">Show answer <kbd>Space</kbd></button></div>`
        }
      </div>`;
    stage.querySelector('#fc').onclick = flip;
    stage.querySelector('#speak').onclick = () => speak(flipped ? s.answer : s.prompt);
    stage.querySelector('#show')?.addEventListener('click', flip);
    stage.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => rate(b.dataset.r)));
  }

  function flip() {
    flipped = !flipped;
    render();
  }

  function rate(r) {
    const card = queue.shift();
    card.srs = schedule(card.srs, r);
    store.countReview();
    store.updateCard(set.id, card.id, { srs: card.srs });
    counts[r]++;
    if (r === 'again' || card.srs.due - Date.now() < 3600000) {
      // Short learning step: see it again this session.
      queue.push(card);
    } else {
      done++;
    }
    flipped = false;
    render();
  }

  function finish() {
    clearTimeout(timer);
    progressBar(progress, total, total, 'Done');
    const upcoming = set.cards.filter((c) => !isNew(c)).map((c) => c.srs.due).sort((a, b) => a - b)[0];
    if (!total) {
      const nextIn = upcoming ? humanDuration(Math.max(0, upcoming - Date.now())) : null;
      finishScreen(stage, {
        title: 'Nothing due right now',
        stats: nextIn ? [{ value: nextIn, label: 'Next review in' }] : [],
        actions: [
          { label: 'Learn new cards', run: () => (location.hash = `/set/${set.id}/learn`) },
          { label: 'Back to set', run: exit },
        ],
      });
      return;
    }
    finishScreen(stage, {
      title: 'Review complete!',
      stats: [
        { value: done, label: 'Reviewed' },
        { value: counts.again, label: 'Forgot' },
        { value: counts.good + counts.easy, label: 'Remembered' },
      ],
      actions: [
        { label: 'Check for more', run: restart },
        { label: 'Back to set', run: exit },
      ],
    });
  }

  function onKey(e) {
    if (e.target.closest('input,textarea,select')) return;
    if (!stage.querySelector('#fc')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!flipped) flip();
      else if (e.key === 'Enter') rate('good');
    }
    const r = RATINGS.find((x) => x.hotkey === e.key);
    if (r && flipped) rate(r.key);
  }

  document.addEventListener('keydown', onKey);
  render();
  return () => {
    document.removeEventListener('keydown', onKey);
    clearTimeout(timer);
  };
}
