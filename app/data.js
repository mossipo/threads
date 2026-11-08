// Data access. Every file lives under data/ and is fetched once, then kept in memory.
// The service worker keeps a copy for offline use.
import { BOOKS, bookOsis, parts, vid, keyOf, NT_START, versesIn, shiftVerse } from './refs.js';

const mem = new Map();
const BASE = new URL('../data/', import.meta.url).href;
export const DATA_CACHE = 'threads-data-v1';

export async function getJSON(path) {
  if (mem.has(path)) return mem.get(path);
  const url = BASE + path;
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    // keep a copy for airplane mode even before the service worker controls the page
    if ('caches' in self && !navigator.serviceWorker?.controller) caches.open(DATA_CACHE).then((c) => c.put(url, r.clone())).catch(() => {});
    return r.json();
  }).catch(async (e) => {
    if ('caches' in self) { const hit = await caches.match(url); if (hit) return hit.json(); }
    throw e;
  });
  mem.set(path, p);
  try { return await p; } catch (e) { mem.delete(path); throw e; }
}
export async function tryJSON(path) { try { return await getJSON(path); } catch { return null; } }

export const meta = {
  verses: () => getJSON('idx/verses.json'),
  sources: () => getJSON('meta/sources.json'),
  checks: () => getJSON('meta/checks.json'),
  files: () => getJSON('meta/files.json'),
  ai: () => getJSON('ai/ai.json'),
  journeys: () => getJSON('journeys/journeys.json'),
  morph: () => getJSON('lex/morph.json'),
  lxxeq: () => getJSON('idx/lxxeq.json'),
  df: () => getJSON('idx/lemma_df.json'),
  typology: () => getJSON('idx/typology.json'),
  en2strong: () => getJSON('idx/en2strong.json'),
  topics: () => getJSON('topics/topics.json'),
  topicWords: () => getJSON('topics/words.json'),
  scrolls: () => getJSON('dss/scrolls.json'),
};

export async function chapters() { return (await meta.verses()).chapters; }

const bookFile = (dir, v) => getJSON(`${dir}/${bookOsis(parts(v)[0])}.json`);
export async function text(v) { return (await bookFile('text', v)).v[keyOf(v)] || null; }
export async function orig(v) { return (await bookFile('orig', v)).v[keyOf(v)] || null; }
export async function xrefs(v) { return (await bookFile('xref', v)).v[keyOf(v)] || []; }
export async function lxx(v) { if (parts(v)[0] >= NT_START) return null; const d = await tryJSON(`lxx/${bookOsis(parts(v)[0])}.json`); return d ? d.v[keyOf(v)] || null : null; }
export async function dssBib(v) { const d = await tryJSON(`dss/bib/${bookOsis(parts(v)[0])}.json`); return d ? d.v[keyOf(v)] || [] : []; }
export async function anfRefs(v) { const d = await tryJSON(`anf/idx/${bookOsis(parts(v)[0])}.json`); return d ? d[keyOf(v)] || [] : []; }
export async function anfPara(vol, pid) { const d = await getJSON(`anf/p/${vol}.json`); return d[pid] || null; }
export async function scrollText(id) { return tryJSON(`dss/text/${id.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`); }

export async function hebRef(v) {
  const m = (await meta.verses()).heb;
  const [b, c, vv] = parts(v);
  return m[`${bookOsis(b)}.${c}.${vv}`] || null;
}

// lexicon entry for a Strong's key ("H7307G" or "G4151")
export function plainKey(s) {
  const m = /^\??([HG])0*(\d+)/.exec(s || '');
  return m ? `${m[1]}${+m[2]}` : null;
}
export async function lexEntry(key) {
  const pk = plainKey(key);
  if (!pk) return null;
  const block = `${pk[0]}${Math.floor(+pk.slice(1) / 250)}`;
  const d = await tryJSON(`lex/${block}.json`);
  return d ? d[pk] || null : null;
}
// brief entry for the exact dStrong, falling back to the plain number
export async function brief(key) {
  const e = await lexEntry(key);
  if (!e || !e.d) return null;
  const k = (key || '').replace(/^\?/, '');
  const norm = k.replace(/^([HG])0*(\d+)/, (m0, a, n) => `${a}${n}`);
  const pk = plainKey(k);
  return e.d[norm] || e.d[k] || e.d[`${pk}G`] || e.d[pk] || Object.values(e.d).find((x) => !x.of) || Object.values(e.d)[0];
}

// occurrences of a dStrong lemma: list of verse ids with counts
export async function occurrences(dkey) {
  const m = /^([HG])0*(\d+)/.exec(dkey);
  if (!m) return [];
  const d = await tryJSON(`idx/lemma/${m[1]}${Math.floor(+m[2] / 500)}.json`);
  if (!d) return [];
  const norm = dkey.replace(/^([HG])0*(\d+)/, (x, a, n) => `${a}${n.padStart(4, '0')}`);
  const list = d[dkey] || d[norm] || [];
  return list.map((x) => (Array.isArray(x) ? { v: x[0], n: x[1] } : { v: x, n: 1 }));
}
export async function lemmaKeysFor(plain) {
  // every dStrong key in the index block that shares the plain number
  const m = /^([HG])(\d+)/.exec(plain);
  const d = await tryJSON(`idx/lemma/${m[1]}${Math.floor(+m[2] / 500)}.json`);
  if (!d) return [];
  return Object.keys(d).filter((k) => plainKey(k) === plain);
}

export async function englishIndex(word) {
  const w = word.toLowerCase();
  const d = await tryJSON(`idx/en/${w[0]}.json`);
  return d ? d[w] || [] : [];
}
export async function englishVocab(letter) { return (await tryJSON(`idx/en/${letter}.json`)) || {}; }

export function topicShard(tid) {
  let h = 0;
  for (const ch of tid) h = (h * 31 + ch.codePointAt(0)) % 1000003;
  return h % 64;
}
export async function topicEntries(tid) { const d = await getJSON(`topics/e/${topicShard(tid)}.json`); return d[tid] || []; }

export async function dssLex(cons) {
  if (!cons) return null;
  const d = await tryJSON(`dss/lex/${cons.codePointAt(0).toString(16)}.json`);
  return d ? d[cons] || null : null;
}

// a passage with 3 verses of context on either side
export async function contextRange(a, z, n = 3) {
  const ch = await chapters();
  return [shiftVerse(a, -n, ch), shiftVerse(z, n, ch)];
}
export async function passageVerses(a, z) { return versesIn(a, z, await chapters()); }

export async function bsbText(v) {
  const t = await text(v);
  if (!t || !t.bsb) return '';
  return t.bsb.map((s) => s[0]).join('');
}

// Hebrew letters only, final forms folded (same as heb_consonants in build/common.py)
export function hebConsonants(s) {
  const fold = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  return [...s.normalize('NFD')].filter((ch) => ch >= 'א' && ch <= 'ת').map((ch) => fold[ch] || ch).join('');
}
export function normGreek(w) {
  return w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^\p{L}]/gu, '');
}
export { BOOKS, vid };
