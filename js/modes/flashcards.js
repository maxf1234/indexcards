import { fmt, shuffle, progressBar, finishScreen } from './common.js';
import { speak } from '../speech.js';

export default function flashcards({ set, cards, sides, stage, progress, store, exit }) {
  let deck = cards.slice();
  let i = 0;
  let flipped = false;
  let known = new Set();
  let learning = new Set();
  let sorting = true; // "know / still learning" sorting, like Quizlet's progress tracking

  const auto = store.getSettings().audio;

  function render() {
    if (i >= deck.length) return finish();
    const card = deck[i];
    const s = sides(card);
    progressBar(progress, i, deck.length, `${i + 1} / ${deck.length}`);
    stage.innerHTML = `
      <div class="fc-wrap">
        <div class="fc ${flipped ? 'flipped' : ''}" id="fc" tabindex="0" aria-live="polite">
          <div class="fc-face front"><small>${s.promptLabel}</small><div class="fc-text">${fmt(s.prompt)}</div></div>
          <div class="fc-face back"><small>${s.answerLabel}</small><div class="fc-text">${fmt(s.answer)}</div></div>
        </div>
        <div class="fc-tools">
          <button class="icon-btn" id="speak" title="Read aloud">🔊</button>
          <button class="icon-btn ${card.starred ? 'on' : ''}" id="star" title="Star (S)">${card.starred ? '★' : '☆'}</button>
          <button class="icon-btn" id="shuffle" title="Shuffle">🔀</button>
          <label class="check small"><input type="checkbox" id="sorting" ${sorting ? 'checked' : ''}> Track progress</label>
        </div>
        ${
          sorting
            ? `<div class="row center gap">
                 <button class="btn lg still" id="no">✗ Still learning <kbd>←</kbd></button>
                 <button class="btn lg know" id="yes">✓ Know <kbd>→</kbd></button>
               </div>
               <p class="muted small center">${learning.size} still learning · ${known.size} known</p>`
            : `<div class="row center gap">
                 <button class="btn lg" id="prev" ${i === 0 ? 'disabled' : ''}>← Prev</button>
                 <button class="btn lg" id="next">Next →</button>
               </div>`
        }
        <p class="muted small center">Click the card or press <kbd>Space</kbd> to flip</p>
      </div>`;
    const fc = stage.querySelector('#fc');
    fc.onclick = flip;
    stage.querySelector('#speak').onclick = () => speak(flipped ? s.answer : s.prompt);
    stage.querySelector('#star').onclick = star;
    stage.querySelector('#shuffle').onclick = () => {
      deck = [...deck.slice(0, i), ...shuffle(deck.slice(i))];
      flipped = false;
      render();
    };
    stage.querySelector('#sorting').onchange = (e) => {
      sorting = e.target.checked;
      render();
    };
    if (sorting) {
      stage.querySelector('#yes').onclick = () => mark(true);
      stage.querySelector('#no').onclick = () => mark(false);
    } else {
      stage.querySelector('#prev').onclick = prev;
      stage.querySelector('#next').onclick = next;
    }
    if (auto && !flipped) speak(s.prompt);
  }

  function flip() {
    flipped = !flipped;
    stage.querySelector('#fc')?.classList.toggle('flipped', flipped);
    if (auto && flipped) speak(sides(deck[i]).answer);
  }
  function star() {
    const card = deck[i];
    card.starred = !card.starred;
    store.updateCard(set.id, card.id, { starred: card.starred });
    render();
  }
  function next() {
    i++;
    flipped = false;
    render();
  }
  function prev() {
    if (i > 0) i--;
    flipped = false;
    render();
  }
  function mark(knows) {
    const id = deck[i].id;
    (knows ? known : learning).add(id);
    (knows ? learning : known).delete(id);
    next();
  }

  function finish() {
    progressBar(progress, deck.length, deck.length, 'Done');
    const still = deck.filter((c) => learning.has(c.id));
    finishScreen(stage, {
      title: sorting ? (still.length ? 'Nice work — keep going!' : 'You know them all!') : 'End of deck',
      stats: sorting ? [{ value: known.size, label: 'Know' }, { value: still.length, label: 'Still learning' }] : [],
      actions: [
        ...(still.length ? [{ label: `Study ${still.length} still-learning cards`, run: () => restart(still) }] : []),
        { label: 'Restart all', run: () => restart(cards) },
        { label: 'Back to set', run: exit },
      ],
      missed: still,
      sides,
    });
  }

  function restart(list) {
    deck = shuffle(list);
    i = 0;
    flipped = false;
    known = new Set();
    learning = new Set();
    render();
  }

  function onKey(e) {
    if (e.target.closest('input,textarea,select')) return;
    if (i >= deck.length) return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      flip();
    } else if (e.key === 'ArrowRight') sorting ? mark(true) : next();
    else if (e.key === 'ArrowLeft') sorting ? mark(false) : prev();
    else if (e.key.toLowerCase() === 's') star();
  }

  document.addEventListener('keydown', onKey);
  render();
  return () => document.removeEventListener('keydown', onKey);
}
