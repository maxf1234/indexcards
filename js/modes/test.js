// Test: a configurable practice exam graded instantly. Unlimited, unlike the
// one-free-test-per-set limits elsewhere.

import { fmt, shuffle, sample, progressBar, finishScreen, choicesFor } from './common.js';
import { gradeAnswer } from '../util.js';

export default function test({ set, cards, sides, stage, progress, store, exit, restart }) {
  const canChoice = cards.length >= 4;

  function setup() {
    progressBar(progress, 0, 1, 'Setup');
    stage.innerHTML = `
      <form class="panel test-setup">
        <h2>Set up your test</h2>
        <label>Questions
          <input class="input sm" type="number" name="count" min="1" max="${cards.length}" value="${Math.min(20, cards.length)}"> of ${cards.length}
        </label>
        <fieldset>
          <legend>Question types</legend>
          <label class="check"><input type="checkbox" name="tf" checked> True / False</label>
          <label class="check"><input type="checkbox" name="mc" ${canChoice ? 'checked' : 'disabled'}> Multiple choice${canChoice ? '' : ' (needs 4+ cards)'}</label>
          <label class="check"><input type="checkbox" name="written" checked> Written</label>
        </fieldset>
        <button class="btn primary lg">Start test</button>
      </form>`;
    stage.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const types = ['tf', 'mc', 'written'].filter((t) => f[t].checked);
      if (!types.length) return;
      const count = Math.max(1, Math.min(cards.length, parseInt(f.count.value, 10) || cards.length));
      build(count, types);
    };
  }

  function build(count, types) {
    const picked = sample(cards, count);
    const questions = picked.map((card, i) => {
      const type = types[i % types.length];
      const s = sides(card);
      if (type === 'mc') return { type, card, s, options: choicesFor(card, cards, sides) };
      if (type === 'tf') {
        const truthful = Math.random() < 0.5 || cards.length < 2;
        let shown = s.answer;
        if (!truthful) {
          const other = shuffle(cards).find((c) => c.id !== card.id && pickSide(c, s) && pickSide(c, s) !== s.answer);
          shown = other ? pickSide(other, s) : s.answer;
        }
        return { type, card, s, shown, truthful: shown === s.answer };
      }
      return { type, card, s };
    });
    // Group by type like a real exam.
    questions.sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type));
    render(questions);
  }

  function pickSide(card, s) {
    return s.answerLabel === 'Term' ? card.term : card.definition;
  }

  function render(questions) {
    progressBar(progress, 0, questions.length, `${questions.length} questions`);
    stage.innerHTML = `
      <form class="test" autocomplete="off">
        ${questions
          .map((q, i) => {
            const head = `<div class="tq-head"><span class="muted small">${i + 1} of ${questions.length}</span></div>`;
            if (q.type === 'tf')
              return `<fieldset class="tq" data-i="${i}">${head}
                <div class="tf"><div><small class="muted">${q.s.promptLabel}</small><div class="q-prompt sm">${fmt(q.s.prompt)}</div></div>
                <div><small class="muted">${q.s.answerLabel}</small><div class="q-prompt sm">${fmt(q.shown)}</div></div></div>
                <div class="row gap"><label class="choice-pill"><input type="radio" name="q${i}" value="true"> True</label>
                <label class="choice-pill"><input type="radio" name="q${i}" value="false"> False</label></div></fieldset>`;
            if (q.type === 'mc')
              return `<fieldset class="tq" data-i="${i}">${head}
                <small class="muted">${q.s.promptLabel}</small><div class="q-prompt sm">${fmt(q.s.prompt)}</div>
                <div class="choices">${q.options.map((o, j) => `<label class="choice"><input type="radio" name="q${i}" value="${j}"><span>${fmt(o)}</span></label>`).join('')}</div></fieldset>`;
            return `<fieldset class="tq" data-i="${i}">${head}
              <small class="muted">${q.s.promptLabel}</small><div class="q-prompt sm">${fmt(q.s.prompt)}</div>
              <input class="input" name="q${i}" placeholder="Type the ${q.s.answerLabel.toLowerCase()}" autocapitalize="off" spellcheck="false"></fieldset>`;
          })
          .join('')}
        <div class="row center"><button class="btn primary lg">Submit test</button></div>
      </form>`;
    const form = stage.querySelector('form');
    form.addEventListener('input', () => {
      const answered = questions.filter((_, i) => {
        const v = form.elements[`q${i}`];
        return v && (v.value || '').trim();
      }).length;
      progressBar(progress, answered, questions.length, `${answered} / ${questions.length} answered`);
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      const unanswered = questions.filter((_, i) => !(form.elements[`q${i}`].value || '').trim()).length;
      if (unanswered && !confirm(`${unanswered} unanswered. Submit anyway?`)) return;
      grade(questions, form);
    };
  }

  function grade(questions, form) {
    let score = 0;
    const missed = [];
    questions.forEach((q, i) => {
      const v = (form.elements[`q${i}`].value || '').trim();
      let ok = false;
      if (q.type === 'tf') ok = v === String(q.truthful);
      else if (q.type === 'mc') ok = v !== '' && q.options[+v] === q.s.answer;
      else ok = gradeAnswer(v, q.s.answer) !== 'wrong';
      if (ok) score++;
      else missed.push(q.card);
      const fs = form.querySelector(`[data-i="${i}"]`);
      fs.classList.add(ok ? 'good' : 'bad');
      fs.disabled = true;
      if (!ok) fs.insertAdjacentHTML('beforeend', `<div class="correction">Correct answer: <b>${fmt(q.s.answer)}</b></div>`);
    });
    const pct = Math.round((score / questions.length) * 100);
    const best = store.recordBest(set.id, 'test', pct, false);
    progressBar(progress, questions.length, questions.length, `${pct}%`);
    const summary = document.createElement('div');
    stage.prepend(summary);
    finishScreen(summary, {
      celebrate: pct >= 70,
      title: `${pct}% — ${pct >= 90 ? 'Excellent!' : pct >= 70 ? 'Good job!' : 'Keep practicing'}`,
      stats: [
        { value: `${score}/${questions.length}`, label: 'Correct' },
        { value: `${set.best?.test ?? pct}%`, label: best ? 'New best!' : 'Best' },
      ],
      actions: [
        ...(missed.length ? [{ label: `Star & learn the ${missed.length} you missed`, run: () => learnMissed(missed) }] : []),
        { label: 'New test', run: restart },
        { label: 'Back to set', run: exit },
      ],
      sides,
    });
    form.querySelector('button[type="submit"], .row.center')?.remove();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function learnMissed(missed) {
    missed.forEach((c) => store.updateCard(set.id, c.id, { starred: true }));
    location.hash = `/set/${set.id}/learn?starred=1`;
  }

  setup();
}
