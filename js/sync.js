// Pure merge logic for cloud sync, kept separate so it can be unit-tested.
//
// Each set is a document. The version with the later `modifiedAt` wins
// (last-writer-wins per set). A deletion is a tombstone with its own
// timestamp, so deleting on one device and editing on another resolves to
// whichever happened later.

export function modifiedAt(set) {
  return set?.modifiedAt || set?.updatedAt || 0;
}

// local: { sets: {id: set}, deleted: {id: ts} }
// rows:  [{ id, data, modified_at, deleted }] from the server
// Returns what to apply locally. Anything local that's newer stays dirty and
// is pushed by the caller afterwards.
export function mergeRemote(local, rows) {
  const upserts = [];
  const deletions = [];
  for (const row of rows) {
    const remoteTs = Number(row.modified_at) || 0;
    const mine = local.sets[row.id];
    const myTs = mine ? modifiedAt(mine) : local.deleted[row.id] ?? -1;
    if (remoteTs <= myTs) continue; // local copy (or local deletion) is as new or newer
    if (row.deleted) {
      if (mine || local.deleted[row.id] == null) deletions.push({ id: row.id, ts: remoteTs });
    } else if (row.data && row.data.id === row.id) {
      upserts.push({ ...row.data, modifiedAt: remoteTs });
    }
  }
  return { upserts, deletions };
}

// Rows to upsert on the server for local changes.
export function toRows(userId, { sets, deletions }) {
  return [
    ...sets.map((s) => ({ user_id: userId, id: s.id, data: s, modified_at: modifiedAt(s), deleted: false })),
    ...deletions.map((d) => ({ user_id: userId, id: d.id, data: {}, modified_at: d.ts, deleted: true })),
  ];
}
