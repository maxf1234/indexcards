import { esc, fmt, shuffle, sample, gradeAnswer } from '../util.js';

export function progressBar(el, done, total, label = '') {
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.innerHTML = `<div class="pbar"><span style="width:${pct}%"></span></div><small>${label || `${done} / ${total}`}</small>`;
}

// Build 4 multiple-choice options: the right answer plus distractors from the set.
export function choicesFor(card, pool, sides) {
  const right = sides(card).answer;
  const seen = new Set([right]);
  const distractors = [];
  for (const c of shuffle(pool)) {
    if (c.id === card.id) continue;
    // Distractors must come from the same side as the answer.
    const a = sides(card).answerLabel === 'Term' ? c.term : c.definition;
    if (!a || seen.has(a)) continue;
    seen.add(a);
    distractors.push(a);
    if (distractors.length === 3) break;
  }
  return shuffle([right, ...distractors]);
}

export function finishScreen(stage, { title, stats = [], actions = [], missed = [], sides, celebrate = true }) {
  stage.innerHTML = `
    <div class="finish">
      ${celebrate ? '<div class="confetti">🎉</div>' : ''}
      <h2>${esc(title)}</h2>
      ${stats.length ? `<div class="stat-row">${stats.map((s) => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
      <div class="row center wrap gap">${actions.map((a, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
      ${
        missed.length
          ? `<h3>Review these</h3><ul class="term-list compact">${missed
              .map((c) => {
                const s = sides(c);
                return `<li><div class="t">${fmt(s.prompt)}</div><div class="d">${fmt(s.answer)}</div></li>`;
              })
              .join('')}</ul>`
          : ''
      }
    </div>`;
  stage.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => actions[b.dataset.i].run()));
  stage.querySelector('[data-i="0"]')?.focus();
}

export { esc, fmt, shuffle, sample };

// Typed-answer question with typo tolerance and an "I was right" override.
// onResult(correct:boolean) is called once the learner continues.
export function writtenQuestion(container, card, sides, onResult) {
  const s = sides(card);
  container.innerHTML = `
    <div class="q">
      <small class="muted">${s.promptLabel}</small>
      <div class="q-prompt">${fmt(s.prompt)}</div>
      <form class="answer-form" autocomplete="off">
        <input class="input big" name="a" placeholder="Type the ${s.answerLabel.toLowerCase()}" autocapitalize="off" spellcheck="false">
        <div class="row gap">
          <button type="button" class="btn ghost" data-act="skip">Don't know</button>
          <button class="btn primary">Answer</button>
        </div>
      </form>
      <div class="feedback" hidden></div>
    </div>`;
  const form = container.querySelector('form');
  const input = form.querySelector('input');
  const fb = container.querySelector('.feedback');
  input.focus();

  const show = (given, grade) => {
    form.hidden = true;
    fb.hidden = false;
    let correct = grade !== 'wrong';
    const msg =
      grade === 'correct' ? '✓ Correct!' : grade === 'close' ? '✓ Almost — watch the spelling' : given ? '✗ Not quite' : 'Here\'s the answer';
    fb.className = `feedback ${correct ? 'good' : 'bad'}`;
    fb.innerHTML = `
      <b>${msg}</b>
      ${grade !== 'correct' && given ? `<div class="yours">You said: <s>${esc(given)}</s></div>` : ''}
      <div class="right">${s.answerLabel}: <b>${fmt(s.answer)}</b></div>
      <div class="row gap">
        ${!correct && given ? '<button class="btn ghost" data-act="override">I was right</button>' : ''}
        <button class="btn primary" data-act="next">Continue <kbd>Enter</kbd></button>
      </div>`;
    const done = () => {
      document.removeEventListener('keydown', onEnter);
      onResult(correct);
    };
    const onEnter = (e) => {
      if (!container.isConnected) return document.removeEventListener('keydown', onEnter);
      if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault();
        done();
      }
    };
    // Safe to attach now: the Enter that submitted has already been dispatched.
    document.addEventListener('keydown', onEnter);
    fb.querySelector('[data-act="next"]').onclick = done;
    const ov = fb.querySelector('[data-act="override"]');
    if (ov)
      ov.onclick = () => {
        correct = true;
        done();
      };
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const given = input.value.trim();
    if (!given) return show('', 'wrong');
    show(given, gradeAnswer(given, s.answer));
  };
  form.querySelector('[data-act="skip"]').onclick = () => show('', 'wrong');
}

// Multiple-choice question. onResult(correct) after feedback.
export function choiceQuestion(container, card, pool, sides, onResult) {
  const s = sides(card);
  const opts = choicesFor(card, pool, sides);
  container.innerHTML = `
    <div class="q">
      <small class="muted">${s.promptLabel}</small>
      <div class="q-prompt">${fmt(s.prompt)}</div>
      <small class="muted">Choose the ${s.answerLabel.toLowerCase()}</small>
      <div class="choices">${opts.map((o, i) => `<button class="choice" data-i="${i}"><kbd>${i + 1}</kbd><span>${fmt(o)}</span></button>`).join('')}</div>
      <div class="feedback" hidden></div>
    </div>`;
  let answered = false;
  const pick = (i) => {
    if (answered || i >= opts.length) return;
    answered = true;
    document.removeEventListener('keydown', onKey);
    const correct = opts[i] === s.answer;
    container.querySelectorAll('.choice').forEach((b, j) => {
      b.disabled = true;
      if (opts[j] === s.answer) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });
    const fb = container.querySelector('.feedback');
    fb.hidden = false;
    fb.className = `feedback ${correct ? 'good' : 'bad'}`;
    if (correct) {
      fb.innerHTML = '<b>✓ Nice!</b>';
      setTimeout(() => container.isConnected && onResult(true), 700);
    } else {
      fb.innerHTML = '<b>✗ Not quite</b> <button class="btn primary" data-act="next">Continue <kbd>Enter</kbd></button>';
      const done = () => {
        document.removeEventListener('keydown', onEnter);
        onResult(false);
      };
      const onEnter = (e) => {
        if (!container.isConnected) return document.removeEventListener('keydown', onEnter);
        if (e.key === 'Enter' && !e.repeat) {
          e.preventDefault();
          done();
        }
      };
      document.addEventListener('keydown', onEnter);
      fb.querySelector('button').onclick = done;
    }
  };
  const onKey = (e) => {
    if (!container.isConnected) return document.removeEventListener('keydown', onKey);
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) pick(n - 1);
  };
  document.addEventListener('keydown', onKey);
  container.querySelectorAll('.choice').forEach((b) => (b.onclick = () => pick(+b.dataset.i)));
  return () => document.removeEventListener('keydown', onKey);
}
