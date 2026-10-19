import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRemote, toRows } from '../js/sync.js';

const set = (id, ts, title = id) => ({ id, title, cards: [], modifiedAt: ts });

test('remote set unknown locally is added', () => {
  const r = mergeRemote({ sets: {}, deleted: {} }, [{ id: 'a', data: set('a', 5), modified_at: 5, deleted: false }]);
  assert.equal(r.upserts.length, 1);
  assert.equal(r.upserts[0].modifiedAt, 5);
});

test('newer remote edit wins, older is ignored', () => {
  const local = { sets: { a: set('a', 10, 'local'), b: set('b', 10, 'local') }, deleted: {} };
  const r = mergeRemote(local, [
    { id: 'a', data: set('a', 20, 'remote'), modified_at: 20, deleted: false },
    { id: 'b', data: set('b', 5, 'remote'), modified_at: 5, deleted: false },
  ]);
  assert.deepEqual(r.upserts.map((s) => [s.id, s.title]), [['a', 'remote']]);
});

test('remote deletion removes an older local copy but not a newer edit', () => {
  const local = { sets: { a: set('a', 10), b: set('b', 30) }, deleted: {} };
  const r = mergeRemote(local, [
    { id: 'a', data: {}, modified_at: 20, deleted: true },
    { id: 'b', data: {}, modified_at: 20, deleted: true },
  ]);
  assert.deepEqual(r.deletions, [{ id: 'a', ts: 20 }]);
});

test('local deletion newer than remote edit is kept', () => {
  const r = mergeRemote({ sets: {}, deleted: { a: 50 } }, [{ id: 'a', data: set('a', 40), modified_at: 40, deleted: false }]);
  assert.equal(r.upserts.length, 0);
  const r2 = mergeRemote({ sets: {}, deleted: { a: 50 } }, [{ id: 'a', data: set('a', 60), modified_at: 60, deleted: false }]);
  assert.equal(r2.upserts.length, 1, 'edit after deletion resurrects the set');
});

test('rows with mismatched ids are rejected', () => {
  const r = mergeRemote({ sets: {}, deleted: {} }, [{ id: 'a', data: set('evil', 5), modified_at: 5, deleted: false }]);
  assert.equal(r.upserts.length, 0);
});

test('toRows builds upserts and tombstones', () => {
  const rows = toRows('u1', { sets: [set('a', 3)], deletions: [{ id: 'b', ts: 4 }] });
  assert.deepEqual(rows.map((r) => [r.user_id, r.id, r.modified_at, r.deleted]), [['u1', 'a', 3, false], ['u1', 'b', 4, true]]);
});
