// Learn: adaptive rounds. Each card climbs from multiple choice (level 1) to
// typed recall (level 2 = learned). Misses drop a level and come back soon.
// Unlike Quizlet, there is no cap on rounds.

import { shuffle, progressBar, finishScreen, choiceQuestion, writtenQuestion, esc } from './common.js';
import { schedule, isNew } from '../srs.js';

const ROUND_SIZE = 7;

export default function learn({ set, cards, sides, stage, progress, store, exit, restart }) {
  const level = new Map(cards.map((c) => [c.id, 0]));
  const usesChoices = cards.length >= 4; // need distractors for multiple choice
  const goal = usesChoices ? 2 : 1;
  let round = 0;
  let queue = [];
  let roundResults = [];

  const learned = () => cards.filter((c) => level.get(c.id) >= goal).length;

  function updateProgress() {
    progressBar(progress, learned(), cards.length, `${learned()} / ${cards.length} learned`);
  }

  function startRound() {
    const remaining = cards.filter((c) => level.get(c.id) < goal);
    if (!remaining.length) return finish();
    round++;
    // Prefer cards already in progress so they get finished, then new ones.
    const ordered = shuffle(remaining).sort((a, b) => level.get(b.id) - level.get(a.id));
    queue = ordered.slice(0, ROUND_SIZE);
    roundResults = [];
    nextQuestion();
  }

  function nextQuestion() {
    updateProgress();
    if (!queue.length) return roundSummary();
    const card = queue.shift();
    const box = document.createElement('div');
    box.className = 'q-box';
    stage.replaceChildren(box);
    const lvl = level.get(card.id);
    const onResult = (correct) => {
      if (correct) {
        const nl = lvl + 1;
        level.set(card.id, nl);
        if (nl >= goal) onLearned(card);
      } else {
        level.set(card.id, Math.max(0, lvl - 1));
        // Re-ask later in this round.
        queue.splice(Math.min(queue.length, 2), 0, card);
      }
      roundResults.push({ card, correct });
      nextQuestion();
    };
    if (usesChoices && lvl === 0) choiceQuestion(box, card, cards, sides, onResult);
    else writtenQuestion(box, card, sides, onResult);
  }

  // Feed newly learned cards into spaced repetition so Review keeps them fresh.
  function onLearned(card) {
    if (isNew(card)) {
      card.srs = schedule(card.srs, 'good');
      store.updateCard(set.id, card.id, { srs: card.srs });
    }
  }

  function roundSummary() {
    const remaining = cards.length - learned();
    if (!remaining) return finish();
    const seen = [...new Map(roundResults.map((r) => [r.card.id, r.card])).values()];
    stage.innerHTML = `
      <div class="finish">
        <h2>Round ${round} done</h2>
        <p class="muted">${learned()} learned · ${remaining} to go</p>
        <ul class="term-list compact">
          ${seen
            .map((c) => {
              const s = sides(c);
              const l = level.get(c.id);
              return `<li><div class="t">${esc(s.prompt)}</div><div class="d">${esc(s.answer)}</div><div class="acts"><span class="pill ${l >= goal ? 'mastered' : 'learning'}">${l >= goal ? 'learned' : 'learning'}</span></div></li>`;
            })
            .join('')}
        </ul>
        <button class="btn primary lg" id="cont">Continue <kbd>Enter</kbd></button>
      </div>`;
    const btn = stage.querySelector('#cont');
    btn.focus();
    btn.onclick = startRound;
  }

  function finish() {
    updateProgress();
    finishScreen(stage, {
      title: 'You learned every card!',
      stats: [
        { value: cards.length, label: 'Cards learned' },
        { value: round, label: round === 1 ? 'Round' : 'Rounds' },
      ],
      actions: [
        { label: 'Learn again', run: restart },
        { label: 'Take a practice test', run: () => (location.hash = `/set/${set.id}/test`) },
        { label: 'Back to set', run: exit },
      ],
      sides,
    });
  }

  startRound();
}
