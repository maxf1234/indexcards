// Import / export / link sharing. No lock-in: anything you put in can come out.

import { normalize } from './util.js';

const SEPARATORS = {
  tab: '\t',
  comma: ',',
  dash: ' - ',
  colon: ':',
  newline: '\n',
  semicolon: ';',
  blankline: '\n\n',
};

export function resolveSep(name, custom) {
  if (name === 'custom') return custom || '\t';
  return SEPARATORS[name] ?? name;
}

// Parse pasted text. Quizlet's own "Export" produces term<TAB>definition per
// line, which is the default here, so moving a set over is copy + paste.
export function parseText(text, termSep = '\t', cardSep = '\n') {
  const cards = [];
  const chunks = String(text).replace(/\r\n?/g, '\n').split(cardSep);
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const i = chunk.indexOf(termSep);
    if (i === -1) {
      cards.push({ term: chunk.trim(), definition: '' });
    } else {
      cards.push({
        term: chunk.slice(0, i).trim(),
        definition: chunk.slice(i + termSep.length).trim(),
      });
    }
  }
  return cards;
}

// Guess separators so most pastes "just work".
export function detectSeparators(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const share = (sep) => lines.filter((l) => l.includes(sep)).length / (lines.length || 1);
  if (share('\t') > 0.6) return { term: 'tab', card: 'newline' };
  if (share(' - ') > 0.6) return { term: 'dash', card: 'newline' };
  if (share(',') > 0.6) return { term: 'comma', card: 'newline' };
  if (share(':') > 0.6) return { term: 'colon', card: 'newline' };
  return { term: 'tab', card: 'newline' };
}

// RFC 4180-ish CSV parser (quoted fields, embedded commas/newlines).
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const cards = rows
    .filter((r) => r.some((f) => f.trim()))
    .map((r) => ({ term: (r[0] || '').trim(), definition: (r[1] || '').trim() }));
  // Drop a header row like "term,definition".
  if (cards.length && /^(term|front|question)$/.test(normalize(cards[0].term))) cards.shift();
  return cards;
}

function csvField(s) {
  s = String(s ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(set) {
  return ['term,definition', ...set.cards.map((c) => `${csvField(c.term)},${csvField(c.definition)}`)].join('\n');
}

// Tab-separated, same format Quizlet/Anki import accepts.
export function toTSV(set) {
  const clean = (s) => String(s).replace(/[\t\n]+/g, ' ');
  return set.cards.map((c) => `${clean(c.term)}\t${clean(c.definition)}`).join('\n');
}

// ---- Link sharing: the whole set is compressed into the URL fragment. ----
// No server stores it, links never expire and never hit a paywall.

function b64url(bytes) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(set) {
  const payload = {
    t: set.title,
    d: set.description || undefined,
    c: set.cards.map((c) => [c.term, c.definition]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + b64url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }
  return 'p' + b64url(bytes);
}

export async function decodeShare(code) {
  const kind = code[0];
  let bytes = fromB64url(code.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'p') throw new Error('Unknown share format');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return {
    title: data.t || 'Shared set',
    description: data.d || '',
    cards: (data.c || []).map(([term, definition]) => ({ term, definition })),
  };
}
