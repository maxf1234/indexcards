// Write: type every answer. Misses are collected and re-asked until all are right.

import { shuffle, progressBar, finishScreen, writtenQuestion } from './common.js';

export default function write({ cards, sides, stage, progress, exit, restart }) {
  let queue = shuffle(cards);
  let missed = [];
  const everMissed = new Set();
  let correctFirstTry = 0;
  let firstPass = true;
  let done = 0;

  function next() {
    progressBar(progress, done, cards.length, `${done} / ${cards.length} correct`);
    if (!queue.length) {
      if (!missed.length) return finish();
      firstPass = false;
      queue = shuffle(missed);
      missed = [];
      stage.innerHTML = `<div class="finish"><h2>Let's retry ${queue.length} you missed</h2><button class="btn primary lg" id="go">Go <kbd>Enter</kbd></button></div>`;
      const b = stage.querySelector('#go');
      b.focus();
      b.onclick = next;
      return;
    }
    const card = queue.shift();
    const box = document.createElement('div');
    box.className = 'q-box';
    stage.replaceChildren(box);
    writtenQuestion(box, card, sides, (correct) => {
      if (correct) {
        done++;
        if (firstPass) correctFirstTry++;
      } else {
        missed.push(card);
        everMissed.add(card);
      }
      next();
    });
  }

  function finish() {
    progressBar(progress, cards.length, cards.length, 'Done');
    const pct = Math.round((correctFirstTry / cards.length) * 100);
    finishScreen(stage, {
      title: pct === 100 ? 'Perfect!' : 'All done!',
      stats: [{ value: `${pct}%`, label: 'First-try accuracy' }],
      actions: [
        { label: 'Write again', run: restart },
        { label: 'Back to set', run: exit },
      ],
      missed: [...everMissed],
      sides,
    });
  }

  next();
}
