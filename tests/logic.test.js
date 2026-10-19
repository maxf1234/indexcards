import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, normalize } from '../js/util.js';
import { schedule, newSrs } from '../js/srs.js';
import { parseText, parseCSV, detectSeparators, toCSV, encodeShare, decodeShare } from '../js/io.js';

test('normalize strips case, accents, punctuation', () => {
  assert.equal(normalize('  Brasília! '), 'brasilia');
});

test('gradeAnswer: exact, typo, alternatives, wrong', () => {
  assert.equal(gradeAnswer('paris', 'Paris'), 'correct');
  assert.equal(gradeAnswer('canbera', 'Canberra'), 'close');
  assert.equal(gradeAnswer('cat', 'dog'), 'wrong');
  assert.equal(gradeAnswer('feline', 'cat; feline'), 'correct');
  assert.equal(gradeAnswer('', 'x'), 'wrong');
  assert.equal(gradeAnswer('cot', 'cat'), 'wrong'); // short answers need exact
});

test('srs intervals grow and lapse resets', () => {
  let s = newSrs();
  s = schedule(s, 'good', 0);
  assert.equal(s.interval, 1);
  s = schedule(s, 'good', 0);
  assert.equal(s.interval, 2.5);
  s = schedule(s, 'easy', 0);
  assert.ok(s.interval > 6);
  s = schedule(s, 'again', 0);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 1);
  assert.ok(s.ease < 2.5 + 0.15);
});

test('parseText handles Quizlet export format', () => {
  const cards = parseText('a\t1\nb\t2\n\nc\tthree, with comma');
  assert.deepEqual(cards.map((c) => c.term), ['a', 'b', 'c']);
  assert.equal(cards[2].definition, 'three, with comma');
});

test('detectSeparators', () => {
  assert.deepEqual(detectSeparators('a - 1\nb - 2'), { term: 'dash', card: 'newline' });
  assert.deepEqual(detectSeparators('a\t1\nb\t2'), { term: 'tab', card: 'newline' });
});

test('CSV round trip with quotes, commas and newlines', () => {
  const set = { cards: [{ term: 'a, b', definition: 'say "hi"\nthere' }, { term: 'x', definition: 'y' }] };
  assert.deepEqual(parseCSV(toCSV(set)), set.cards);
});

test('share links round trip', async () => {
  const set = { title: 'Ünïcode ✓', description: '', cards: [{ term: 'α', definition: 'alpha' }] };
  const code = await encodeShare(set);
  assert.ok(!/[+/=]/.test(code));
  const back = await decodeShare(code);
  assert.equal(back.title, set.title);
  assert.deepEqual(back.cards, set.cards);
});
