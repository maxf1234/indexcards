// Match: clear the board by pairing terms with definitions, against the clock.

import { esc, sample, shuffle, progressBar, finishScreen } from './common.js';

const PAIRS = 6;

export default function match({ set, cards, stage, progress, store, exit, restart }) {
  const picked = sample(cards, Math.min(PAIRS, cards.length));
  const tiles = shuffle(
    picked.flatMap((c) => [
      { id: c.id, text: c.term, side: 't' },
      { id: c.id, text: c.definition, side: 'd' },
    ])
  );
  let start = 0;
  let timer = null;
  let penalty = 0;
  let selected = null;
  let cleared = 0;

  function intro() {
    progressBar(progress, 0, picked.length, 'Ready');
    stage.innerHTML = `
      <div class="finish">
        <h2>Match all the terms with their definitions</h2>
        <p class="muted">Wrong matches add 1 second. ${set.best?.match ? `Best: <b>${fmtTime(set.best.match)}</b>` : ''}</p>
        <button class="btn primary lg" id="go">Start game</button>
      </div>`;
    const b = stage.querySelector('#go');
    b.focus();
    b.onclick = play;
  }

  function play() {
    stage.innerHTML = `<div class="match-grid">${tiles
      .map((t, i) => `<button class="tile" data-i="${i}">${esc(t.text)}</button>`)
      .join('')}</div>`;
    start = performance.now();
    timer = setInterval(tick, 100);
    stage.querySelectorAll('.tile').forEach((el) => (el.onclick = () => choose(el)));
  }

  function elapsed() {
    return performance.now() - start + penalty;
  }

  function tick() {
    progressBar(progress, cleared, picked.length, fmtTime(elapsed()));
  }

  function choose(el) {
    const t = tiles[el.dataset.i];
    if (el.classList.contains('gone')) return;
    if (!selected) {
      selected = el;
      el.classList.add('sel');
      return;
    }
    if (selected === el) {
      el.classList.remove('sel');
      selected = null;
      return;
    }
    const s = tiles[selected.dataset.i];
    const a = selected;
    selected = null;
    a.classList.remove('sel');
    if (s.id === t.id && s.side !== t.side) {
      a.classList.add('gone');
      el.classList.add('gone');
      cleared++;
      if (cleared === picked.length) finish();
    } else {
      penalty += 1000;
      a.classList.add('miss');
      el.classList.add('miss');
      setTimeout(() => {
        a.classList.remove('miss');
        el.classList.remove('miss');
      }, 450);
    }
  }

  function finish() {
    clearInterval(timer);
    const ms = Math.round(elapsed());
    const best = store.recordBest(set.id, 'match', ms, true);
    progressBar(progress, picked.length, picked.length, fmtTime(ms));
    finishScreen(stage, {
      title: best ? `New record: ${fmtTime(ms)}!` : `Finished in ${fmtTime(ms)}`,
      stats: [{ value: fmtTime(set.best.match), label: 'Best time' }],
      actions: [
        { label: 'Play again', run: restart },
        { label: 'Back to set', run: exit },
      ],
    });
  }

  intro();
  return () => clearInterval(timer);
}

function fmtTime(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
