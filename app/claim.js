// "Does the text bear it?" An offline, deterministic search for a claim's support, tensions,
// variant dependencies and tier warnings. It reports evidence and its weight; it never rules
// on whether the claim is true.
import { meta, getJSON, englishVocab, occurrences, lemmaKeysFor, topicEntries, xrefs, orig, dssBib, plainKey, brief, passageVerses } from './data.js';
import { parts, NT_START, rangeLabel, label, keyOf, bookOsis as osis } from './refs.js';
import { weightOf } from './links.js';

const STOP = new Set(('a an the and or of to in on for with by from as at is are was were be been being it its this that these those ' +
  'his her their our your my he she they we you i me him them us not no but if then than so such which who whom what when where how ' +
  'all any each every other some see also do does did done can could should would will shall may might must have has had ' +
  'out up down over under into upon about through again bible scripture scriptures teaches teach says say said text texts claim true always never').split(' '));
const N_VERSES = 31102;

// negation, limitation and condition markers (Strong's numbers), same list as build/build_markers.py
export const MARKERS = {
  G3756: 'not (οὐ)', G3361: 'not (μή)', G3762: 'no one (οὐδείς)', G3367: 'no one (μηδείς)', G3761: 'nor (οὐδέ)',
  G3366: 'nor (μηδέ)', G4133: 'except (πλήν)', G1437: 'if (ἐάν)', G1487: 'if (εἰ)', G235: 'but (ἀλλά)',
  H3808: 'not (לֹא)', H408: 'do not (אַל)', H369: 'there is not (אַיִן)', H1115: 'not (בִּלְתִּי)', H518: 'if (אִם)',
  H389: 'only (אַךְ)', H7535: 'only (רַק)', H657: 'except (אֶפֶס)',
};

export function keywords(claim) {
  return [...new Set((claim.toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w)))];
}
function variantsOf(w) {
  // the word, its likely stem, and the common English endings of both (heal, heals, healed, healing ...)
  const stems = new Set([w]);
  if (w.endsWith('ies') && w.length > 4) stems.add(`${w.slice(0, -3)}y`);
  for (const suf of ['ing', 'ed', 'es', 's', 'd', 'er', 'ers']) if (w.endsWith(suf) && w.length - suf.length > 2) stems.add(w.slice(0, -suf.length));
  const v = new Set();
  for (const s of stems) {
    v.add(s);
    for (const suf of ['s', 'es', 'ed', 'd', 'ing', 'er']) v.add(`${s}${suf}`);
    if (s.endsWith('y')) v.add(`${s.slice(0, -1)}ies`);
    if (s.endsWith('e')) v.add(`${s.slice(0, -1)}ing`);
  }
  return [...v];
}
// a topic entry's own words, without its list of references
export function entryLabel(text) {
  const m = /\s(?:[1-3]?[A-Z][a-z]{0,4}\.?)\s?\d+[:.]\d+/.exec(text);
  return (m ? text.slice(0, m.index) : text).trim().replace(/^\.\s*/, '') || text.slice(0, 60);
}

export async function runClaim(claim, opts = {}) {
  const pins = opts.pins || [];
  const removed = new Set(opts.removed || []);
  const kws = keywords(claim);
  const cand = new Map();
  const ev = (v) => { if (!cand.has(v)) cand.set(v, { v, kw: new Map(), lemma: new Map(), topic: [], graph: [], score: 0 }); return cand.get(v); };

  // 1. the claim's English words in the BSB
  const concepts = [];
  for (const k of kws) {
    const vocab = await englishVocab(k[0]);
    const forms = variantsOf(k).filter((f) => vocab[f]);
    const verses = new Set();
    for (const f of forms) for (const v of vocab[f]) verses.add(v);
    const w = verses.size ? Math.log(N_VERSES / verses.size) : 0;
    concepts.push({ k, forms, df: verses.size, w, lemmas: [] });
    for (const v of verses) ev(v).kw.set(k, w);
  }

  // 2. the Hebrew and Greek lemmas under those words (from the BSB alignment), then every verse using them
  const en2s = await meta.en2strong();
  const df = await meta.df();
  const lemmaInfo = [];
  for (const c of concepts) {
    const counts = new Map();
    for (const f of c.forms) for (const [s, n] of en2s[f] || []) { const pk = plainKey(s); if (pk) counts.set(pk, (counts.get(pk) || 0) + n); }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    for (const [pk, n] of counts) {
      if (n / total < 0.2 || n < 3) continue;
      const w = weightOf(pk, df);
      const b = await brief(pk);
      lemmaInfo.push({ pk, w, k: c.k, lemma: b ? b.l : '', gloss: b ? b.g : '' });
      c.lemmas.push(pk);
      if (w <= 0) continue;
      for (const dk of await lemmaKeysFor(pk)) for (const occ of await occurrences(dk)) ev(occ.v).lemma.set(pk, w);
    }
  }

  // 3. topical indexes: topics whose titles carry the claim's rarer words count most
  const tw = await meta.topicWords();
  const topics = await meta.topics();
  const tById = new Map(topics.map((t) => [t[0], t]));
  const tScore = new Map();
  for (const c of concepts) {
    for (const f of c.forms.length ? c.forms : variantsOf(c.k)) {
      for (const tid of tw.title[f] || []) tScore.set(tid, (tScore.get(tid) || 0) + c.w);
      for (const tid of tw.entry[f] || []) tScore.set(tid, (tScore.get(tid) || 0) + c.w * 0.25);
    }
  }
  const topTopics = [...tScore.entries()].filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topicHits = [];
  for (const [tid, s] of topTopics) {
    const t = tById.get(tid);
    const entries = await topicEntries(tid);
    const big = entries.length > 40;
    let n = 0;
    for (const [, textE, refs] of entries) {
      const low = textE.toLowerCase();
      const entryMatch = concepts.some((c) => c.forms.some((f) => new RegExp(`\\b${f}\\b`).test(low)));
      if (big && !entryMatch) continue;
      for (const [a0, z0] of refs) {
        let vs = [];
        try { vs = await passageVerses(a0, Math.min(z0, a0 + 7)); } catch { vs = [a0]; }
        for (const v of vs.slice(0, 8)) {
          ev(v).topic.push({ src: t[1], title: t[2], text: entryLabel(textE), pts: Math.min(3, s / 3) + (entryMatch ? 1 : 0) });
          n += 1;
        }
      }
    }
    topicHits.push({ tid, src: t[1], title: t[2], refs: n });
  }

  // 4. score: each claim concept counts once, by its rarer evidence (English word or lemma);
  //    more of the claim covered counts for more; topics and the graph add a little
  for (const e of cand.values()) {
    let s = 0; let matched = 0; let viaLemma = 0;
    for (const c of concepts) {
      const a = e.kw.get(c.k) || 0;
      const b = Math.max(0, ...c.lemmas.map((pk) => e.lemma.get(pk) || 0));
      if (a || b) { s += Math.max(a, b); matched += 1; if (b) viaLemma += 1; }
    }
    const cover = concepts.length ? matched / concepts.length : 0;
    const tp = Math.min(4, e.topic.reduce((x, t) => x + t.pts, 0));
    e.matched = matched; e.viaLemma = viaLemma;
    e.score = s * (0.6 + 0.4 * cover) + tp;
  }

  // 5. cross-reference graph: strong links out of the leading candidates
  const lead = [...cand.values()].filter((e) => !removed.has(e.v)).sort((a, b) => b.score - a.score).slice(0, 8);
  for (const e of lead) {
    for (const r of await xrefs(e.v)) {
      const [b0, , typ, score] = r;
      if (score < 50 || !['q', 'a', 't'].includes(typ)) continue;
      const t = ev(b0);
      t.graph.push({ from: e.v, typ, score });
      t.score += score / 25;
      if (t.matched === undefined) { t.matched = 0; t.viaLemma = 0; }
    }
  }

  // 6. supporting texts
  const minDirect = Math.min(2, concepts.length);
  const isDirect = (e) => (e.matched || 0) >= minDirect && (e.viaLemma || 0) >= 1;
  const ranked = [...cand.values()].filter((e) => !removed.has(e.v) && e.score > 0).sort((a, b) => b.score - a.score);
  const supporting = ranked.slice(0, 12);
  for (const p of pins.filter((x) => x.as !== 'tension' && x.tier === 1)) {
    const have = supporting.find((e) => e.v === p.v);
    if (have) have.pinned = true;
    else supporting.unshift({ ...(cand.get(p.v) || { v: p.v, kw: new Map(), lemma: new Map(), topic: [], graph: [], score: 0 }), pinned: true });
  }

  // 7. tension texts (rule-flagged): the claim's words or lemmas together with a negation, limitation or condition
  const supportSet = new Set(supporting.map((e) => e.v));
  const claimLemmas = new Set(lemmaInfo.filter((l) => l.w > 0).map((l) => l.pk));
  const tension = [];
  const mk = await getJSON('idx/markers.json');
  for (const e of ranked) {
    if (supportSet.has(e.v) || (e.matched || 0) < minDirect) continue;
    const bits = mk.v[e.v];
    if (!bits) continue;
    tension.push({ ...e, markers: mk.m.filter((_, i) => bits & (1 << i)).map((k) => MARKERS[k]) });
    if (tension.length >= 6) break;
  }
  for (const p of pins.filter((x) => x.as === 'tension' && x.tier === 1)) {
    if (!tension.some((e) => e.v === p.v)) tension.unshift({ v: p.v, kw: new Map(), lemma: new Map(), topic: [], graph: [], markers: [], pinned: true });
  }

  // 8. variant dependencies
  const ai = await meta.ai();
  const variants = [];
  for (const e of [...supporting, ...tension]) {
    const vd = await variantCheck(e.v, claimLemmas, ai);
    if (vd.length) variants.push({ v: e.v, notes: vd, group: supportSet.has(e.v) ? 'support' : 'tension' });
  }

  // 9. tier warnings
  const warnings = [];
  const lowTier = pins.filter((p) => p.tier > 1);
  if (!supporting.length && lowTier.length) warnings.push('Only Tier 2 to 4 texts support this claim in the current set. No Scripture text does. Tier 2 to 4 can illuminate, confirm or complicate a reading, but they cannot carry a claim alone.');
  for (const p of lowTier) warnings.push(`${p.label} is Tier ${p.tier} (${['', 'Scripture', 'textual witness', 'Jewish background', 'early church reception'][p.tier]}). It is shown beside the evidence, never counted as support from Scripture.`);
  for (const x of variants) for (const n of x.notes) if (n.tier2) warnings.push(`${label(x.v)}: ${n.text}`);

  // 10. weight summary in plain words, never a verdict
  const direct = supporting.filter(isDirect).length;
  const indirect = supporting.length - direct;
  const vlist = variants.filter((x) => x.group === 'support').map((x) => label(x.v));
  let weight;
  if (!supporting.length) weight = 'No supporting texts found by the offline search. Try other words, or pin texts by hand.';
  else {
    weight = `Direct support from ${direct} text${direct === 1 ? '' : 's'} in context`;
    if (indirect) weight += `; ${indirect} more by topic, partial wording or cross-reference only`;
    weight += `; ${tension.length} tension text${tension.length === 1 ? '' : 's'}`;
    weight += vlist.length ? `; variant dependency at ${vlist.join(', ')}.` : '; no variant dependency.';
    if (warnings.length) weight += ` ${warnings.length} tier warning${warnings.length === 1 ? '' : 's'}.`;
  }
  return { claim, kws: concepts, lemmas: lemmaInfo, topics: topicHits, supporting, tension, variants, warnings, weight, isDirect, lowTier };
}

// variant notes for one verse, limited to the words that carry the claim when the claim's lemmas are known
export async function variantCheck(v, claimLemmas, ai) {
  const out = [];
  const o = await orig(v);
  const nt = parts(v)[0] >= NT_START;
  const carries = (pk) => !claimLemmas.size || claimLemmas.has(pk);
  if (o) {
    const words = o.w.filter((w) => carries(plainKey(w[3])));
    const use = words.length ? words : o.w;
    if (nt) {
      const notNA = use.filter((w) => !/N/.test(w[6]));
      const notTR = use.filter((w) => !/K/.test(w[6]));
      const bracketed = use.filter((w) => /\(K\)|\(O\)|\(N\)/.test(w[6]));
      if (notNA.length) out.push({ text: `${notNA.length} word${notNA.length > 1 ? 's' : ''} here (${notNA.slice(0, 4).map((w) => w[2]).join(', ')}) are not in the Nestle-Aland text; they stand in ${editionsText(notNA[0])}.` });
      if (notTR.length) out.push({ text: `${notTR.length} word${notTR.length > 1 ? 's' : ''} (${notTR.slice(0, 4).map((w) => w[2]).join(', ')}) are not in the Textus Receptus (the KJV's Greek).` });
      if (bracketed.length && !notNA.length && !notTR.length) out.push({ text: `Manuscripts differ on ${bracketed.length} word${bracketed.length > 1 ? 's' : ''} here (${bracketed.slice(0, 3).map((w) => w[2]).join(', ')}).` });
      if (o.g && /⟦/.test(o.g)) out.push({ text: 'The SBLGNT prints this verse in double brackets (text its editor judges a later addition).' });
    } else {
      const x = use.filter((w) => /^X/.test(w[6]));
      const qk = use.filter((w) => /^[QK]/.test(w[6]) || /\(/.test(w[6]));
      if (x.length) out.push({ text: `${x.length} Hebrew word${x.length > 1 ? 's' : ''} here are reconstructed from the Septuagint (STEPBible "X"), not in the Leningrad Codex.`, tier2: true });
      if (qk.length) out.push({ text: `${qk.length} word${qk.length > 1 ? 's' : ''} follow a Masoretic marginal reading or have recorded variants (${qk.slice(0, 3).map((w) => `${w[2]} [${w[6]}]`).join(', ')}).` });
      // scroll differences that touch the claim's words
      const mt = o.w.filter((w) => !/^[XR]/.test(w[6]));
      const hits = [];
      for (const r of await dssBib(v)) {
        let touched = false;
        for (const w of r.w) {
          if (w[1] === 'd' && mt[w[3]] && carries(plainKey(mt[w[3]][3]))) touched = true;
          if (w[1] === 'p' && (w[2] || []).some((g) => carries(plainKey(g[0])))) touched = true;
        }
        for (const [j] of r.m) if (mt[j] && carries(plainKey(mt[j][3]))) touched = true;
        if (touched) hits.push(r.s);
      }
      if (hits.length) out.push({ text: `Dead Sea Scrolls differ in ${claimLemmas.size ? 'the claim\'s words' : 'wording'} here: ${hits.join(', ')}.` });
    }
  }
  const [b, c, vv] = parts(v);
  if (ai.dss_notes[`${osis(b)}.${c}.${vv}`]) out.push({ text: 'A major Dead Sea Scrolls variant is noted for this verse (open the scroll note).' });
  return out;
}

function editionsText(w) {
  const names = ['NA28', 'NA27', 'Tyndale House GNT', 'SBLGNT', 'Westcott-Hort', 'Tregelles', 'Textus Receptus', 'Byzantine'];
  const bits = w[9] || 0;
  const list = names.filter((_, i) => bits & (1 << i));
  return list.length ? list.join(', ') : 'other editions';
}

export { keyOf, rangeLabel };
