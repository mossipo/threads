// Links for a passage: the build-time graph plus rare shared lemmas found from the lemma index.
// Every number here comes from data; the formulas are the ones printed in explain().
import { xrefs, orig, occurrences, meta, passageVerses, plainKey, brief } from './data.js';
import { parts, NT_START, rangeLabel, osisOf } from './refs.js';

const KEY_WEIGHT = 3.5;
const RARE_DF = 12;

export function weightOf(plain, df) {
  const isH = plain[0] === 'H';
  const d = (isH ? df.h : df.g)[plain] || 0;
  if (!d || d > df.max_df) return 0;
  return Math.log((isH ? df.nh : df.ng) / d);
}

// record: start, end, type, score, Q, L, V, T, shared lemmas, [votes from this verse, votes from the other],
// quotation run, typology entry, N (Nave's quotation list); trailing empty fields may be left out
export function fromRecord(v, r) {
  const [b0, b1, typ, score, Q, L, V, T, shared, votes, quote, typo, N] = r;
  const pair = Array.isArray(votes) ? votes : (votes === null || votes === undefined ? null : [votes, null]);
  return { from: v, b0, b1, typ, score, Q, L, V, T, N: N || 0, shared: shared || [], votes: pair, quote: quote || null, typo: typo || null, via: [v], origin: 'graph' };
}

export async function linksFor(a, z, opts = {}) {
  const vs = await passageVerses(a, z);
  const byTarget = new Map();
  for (const v of vs) {
    for (const r of await xrefs(v)) {
      const L = fromRecord(v, r);
      if (L.b0 >= a && L.b1 <= z) continue;
      const key = `${L.b0}-${L.b1}`;
      const prev = byTarget.get(key);
      if (!prev) byTarget.set(key, L);
      else if (L.score > prev.score) { L.via = [...prev.via, v]; byTarget.set(key, L); } else prev.via.push(v);
    }
  }
  if (opts.lemmaLinks !== false) await addRareLemmaLinks(vs, a, z, byTarget);
  return [...byTarget.values()].sort((x, y) => y.score - x.score);
}

async function addRareLemmaLinks(vs, a, z, byTarget) {
  const df = await meta.df();
  const rare = new Map();
  for (const v of vs) {
    const o = await orig(v);
    if (!o) continue;
    for (const w of o.w) {
      if (parts(v)[0] >= NT_START && !/[NK]/.test(w[6])) continue;
      if (parts(v)[0] < NT_START && /^[XR]/.test(w[6])) continue;
      const pk = plainKey(w[3]);
      if (!pk || (pk[0] === 'H' && +pk.slice(1) >= 9000)) continue;
      const d = (pk[0] === 'H' ? df.h : df.g)[pk] || 0;
      if (d > 0 && d <= RARE_DF && !rare.has(w[3])) rare.set(w[3], { from: v, pk });
    }
  }
  let added = 0;
  for (const [dkey, info] of rare) {
    const w = weightOf(info.pk, df);
    for (const occ of await occurrences(dkey)) {
      if (occ.v >= a && occ.v <= z) continue;
      const key = `${occ.v}-${occ.v}`;
      const prev = byTarget.get(key);
      if (prev) continue;
      const L = Math.min(40, Math.round(2.5 * w));
      byTarget.set(key, { from: info.from, b0: occ.v, b1: occ.v, typ: w >= KEY_WEIGHT ? 'l' : 'e', score: L, Q: 0, L, V: 0, T: 0,
        shared: [[info.pk, Math.round(w * 10) / 10]], votes: null, quote: null, typo: null, via: [info.from], origin: 'lemma' });
      added += 1;
      if (added > 14) return;
    }
  }
}

// rows for the "how was this scored" panel
export async function explain(link) {
  const rows = [];
  if (link.quote) {
    rows.push(['Quotation (Q)', link.Q, `Longest run of identical words shared with the Septuagint: ${link.quote[0]} words ("${link.quote[1]}"). 10 points per word, maximum 60.`]);
  } else {
    rows.push(['Quotation (Q)', 0, 'No run of 3 or more shared Septuagint words (only checked between the New Testament and the Septuagint).']);
  }
  const lem = [];
  for (const [pk, w] of link.shared) {
    const b = await brief(pk);
    lem.push(`${b ? `${b.l} (${b.g})` : pk} ${pk}: weight ${w}`);
  }
  rows.push(['Shared lemmas (L)', link.L, lem.length
    ? `2.5 points per unit of rarity weight, maximum 40. Weight = ln(verses in corpus / verses using the lemma). ${lem.join('; ')}`
    : 'No shared lemma rare enough to carry weight (lemmas in more than 1,500 verses are ignored).']);
  const vp = link.votes;
  let vtext = 'Not in the OpenBible.info data.';
  if (vp) {
    const here = rangeLabel(link.from, link.from); const there = rangeLabel(link.b0, link.b1);
    const parts2 = [];
    if (vp[0] !== null && vp[0] !== undefined) parts2.push(`${vp[0]} votes for ${here} to ${there}`);
    if (vp[1] !== null && vp[1] !== undefined) parts2.push(`${vp[1]} votes for ${there} to ${here}`);
    const used = Math.max(...vp.filter((x) => x !== null && x !== undefined));
    vtext = `OpenBible.info: ${parts2.join('; ')}.${parts2.length > 1 ? ' The score uses the larger count.' : ''} Points = round(10 x log10(1 + ${used})), maximum 30; zero or negative votes give 0.`;
  }
  rows.push(['OpenBible votes (V)', link.V, vtext]);
  rows.push(['Treasury of Scripture Knowledge (T)', link.T, link.T ? 'Listed in the TSK (either direction): 15 points.' : 'Not listed in the TSK.']);
  rows.push(["Nave's quotation list (N)", link.N || 0, link.N ? "Nave's Topical Bible, QUOTATIONS AND ALLUSIONS, pairs these passages: 20 points. A pair on this list is typed at least as a clear allusion." : "Not paired in Nave's QUOTATIONS AND ALLUSIONS."]);
  if (link.origin === 'lemma') rows.push(['Source of this link', '', 'Found from the lemma index: the two verses share a lemma used in 12 or fewer verses. It is not in OpenBible or the TSK.']);
  return rows;
}

export function summary(link) {
  const t = { q: 'direct quotation', a: 'clear allusion', l: 'shared key lemma', t: 'typology', e: 'thematic echo' }[link.typ];
  return `${rangeLabel(link.from, link.from)} to ${rangeLabel(link.b0, link.b1)}: ${t}, score ${link.score} (Q ${link.Q}, L ${link.L}, V ${link.V}, T ${link.T}${link.N ? `, N ${link.N}` : ''}).`;
}

export function reasonKey(a, b) { return [`${osisOf(a)}|${osisOf(b)}`, `${osisOf(b)}|${osisOf(a)}`]; }
export async function aiReason(link) {
  const ai = await meta.ai();
  const targets = [];
  for (let t = link.b0; t <= link.b1 && targets.length < 40; t++) targets.push(t);
  for (const v of link.via) {
    for (const t of targets) for (const k of reasonKey(v, t)) if (ai.link_reasons[k]) return ai.link_reasons[k];
  }
  return null;
}
