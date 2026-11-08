// "Does the text bear it?" An offline, deterministic search for a claim's support, tensions,
// variant dependencies and tier warnings. It reports evidence and its weight; it never rules
// on whether the claim is true.
//
// How it works (every step is shown to the reader in the report):
// 1. The claim's words become concepts: each word, its English word family in the BSB, and the Hebrew
//    and Greek lemmas the BSB aligns to that family. A word like "every" or "all" is kept as a quantifier.
// 2. Verses carrying a concept by English word, by lemma, or by a Nave or Torrey topic entry gain weight
//    by the rarity of the concept, and more when they carry more of the claim.
// 3. The cross-reference graph spreads weight from the strongest verses to the verses they link to,
//    up to two steps, so texts the Bible itself connects are found even without the claim's words.
// 4. Neighbouring verses join into passages; every passage is shown with its context.
// 5. Tension texts are flagged by rule: a negation directly before a word that carries the claim, a
//    negation directly before "all" when the claim says "every" or "all", or a negation in a text linked
//    to such a flagged text.
import { meta, getJSON, englishVocab, occurrences, lemmaKeysFor, topicEntries, xrefs, orig, seq, dssBib, plainKey, brief, chapters } from './data.js';
import { parts, NT_START, rangeLabel, label, keyOf, bookOsis as osis, vid } from './refs.js';
import { weightOf } from './links.js';
import { editionInfo } from './editions.js';

const STOP = new Set(('a an the and or of to in on for with by from as at is are was were be been being it its this that these those ' +
  'his her their our your my he she they we you i me him them us but if then than so such which who whom what when where how ' +
  'other some see also do does did done can could should would will shall may might must have has had ' +
  'out up down over under into upon about through again bible scripture scriptures teaches teach says say said text texts claim true').split(' '));
const QUANT = new Set(['every', 'all', 'each', 'everyone', 'everybody', 'anyone', 'anybody', 'whoever', 'always']);
const MODALS = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would']);
const NEGATIVE = new Set(['not', 'no', 'never', 'cannot', 'none', 'nobody', 'nothing']);
export const QUANT_LEMMAS = ['G3956', 'G1538', 'G3650', 'G537', 'H3605'];
export const NEG_LEMMAS = new Set(['G3756', 'G3361', 'G3762', 'G3367', 'G3761', 'G3366', 'G3364', 'G3765', 'G3371',
  'H3808', 'H408', 'H369', 'H1115', 'H1077']);
const N_VERSES = 31102;

// negation, limitation and condition markers (Strong's numbers), same list as build/build_markers.py
export const MARKERS = {
  G3756: 'not (οὐ)', G3361: 'not (μή)', G3762: 'no one (οὐδείς)', G3367: 'no one (μηδείς)', G3761: 'nor (οὐδέ)',
  G3366: 'nor (μηδέ)', G4133: 'except (πλήν)', G1437: 'if (ἐάν)', G1487: 'if (εἰ)', G235: 'but (ἀλλά)',
  H3808: 'not (לֹא)', H408: 'do not (אַל)', H369: 'there is not (אַיִן)', H1115: 'not (בִּלְתִּי)', H518: 'if (אִם)',
  H389: 'only (אַךְ)', H7535: 'only (רַק)', H657: 'except (אֶפֶס)',
};

// English forms that inflection rules cannot reach
const IRREGULAR = {
  child: ['children'], children: ['child'], man: ['men'], men: ['man'], woman: ['women'], women: ['woman'],
  bear: ['bore', 'borne'], bore: ['bear', 'borne'], borne: ['bear', 'bore'], give: ['gave', 'given'], gave: ['give', 'given'],
  take: ['took', 'taken'], took: ['take', 'taken'], speak: ['spoke', 'spoken'], spoke: ['speak', 'spoken'],
  see: ['saw', 'seen'], saw: ['see', 'seen'], go: ['went', 'gone'], come: ['came'], came: ['come'], bring: ['brought'],
  teach: ['taught'], die: ['died', 'dead'], died: ['die', 'dead'], fall: ['fell', 'fallen'], forgive: ['forgave', 'forgiven'],
  rise: ['rose', 'risen'], know: ['knew', 'known'], write: ['wrote', 'written'], foot: ['feet'], tooth: ['teeth'],
  sin: ['sinned', 'sinning', 'sins'], pray: ['prayed', 'praying', 'prayer', 'prayers'], fly: ['flew'], lead: ['led'],
};
// kinship words the BSB Old Testament expresses with other nouns ("parents" there is "father and mother")
const RELATED = {
  parent: ['father', 'fathers', 'mother', 'mothers', 'forefathers'], parents: ['father', 'fathers', 'mother', 'mothers', 'forefathers'],
  ancestor: ['fathers', 'forefathers'], ancestors: ['fathers', 'forefathers'], offspring: ['descendants', 'seed'],
};
const SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'ment', 'ments', 'ness', 'less', 'ful', 'y', 'ies', 'ied', 'ings', 'ion', 'ions'];

export function keywords(claim) {
  return [...new Set((claim.toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w) && !QUANT.has(w) && !NEGATIVE.has(w)))];
}
function inflections(w) {
  const stems = new Set([w]);
  if (w.endsWith('ies') && w.length > 4) stems.add(`${w.slice(0, -3)}y`);
  if (w.endsWith('ied') && w.length > 4) stems.add(`${w.slice(0, -3)}y`);
  for (const suf of ['ing', 'ed', 'es', 's', 'd', 'er', 'ers']) if (w.endsWith(suf) && w.length - suf.length > 2) stems.add(w.slice(0, -suf.length));
  const v = new Set();
  for (const s of stems) {
    v.add(s);
    for (const suf of ['s', 'es', 'ed', 'd', 'ing', 'er']) v.add(`${s}${suf}`);
    if (s.endsWith('y')) { v.add(`${s.slice(0, -1)}ies`); v.add(`${s.slice(0, -1)}ied`); }
    if (s.endsWith('e')) v.add(`${s.slice(0, -1)}ing`);
  }
  return v;
}
function irregulars(forms) {
  const out = new Set();
  for (const s of forms) for (const x of IRREGULAR[s] || []) if (!forms.has(x)) out.add(x);
  return out;
}
export function stemOf(w) {
  for (const suf of ['ments', 'ment', 'ings', 'ing', 'ers', 'ies', 'ied', 'ed', 'er', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      const s = w.slice(0, -suf.length);
      return suf === 'ies' || suf === 'ied' ? `${s}y` : s;
    }
  }
  return w;
}

// a claim word's English family as found in the BSB: form -> weight (1 inflection, 0.8 derived, 0.6 related)
async function family(word) {
  const forms = new Map();
  const vocabs = new Map();
  const vocab = async (letter) => { if (!vocabs.has(letter)) vocabs.set(letter, await englishVocab(letter)); return vocabs.get(letter); };
  const add = async (f, wt) => { if ((await vocab(f[0]))[f] && (forms.get(f) || 0) < wt) forms.set(f, wt); };
  const infl = inflections(word);
  for (const f of infl) await add(f, 1);
  // irregular forms count as the word itself in the text, but not when choosing its lemmas
  // ("bore" is mostly "gave birth" in the BSB, while "bear" is mostly "carry")
  for (const f of irregulars(infl)) await add(f, 0.95);
  const stem = stemOf(word);
  const voc = await vocab(stem[0]);
  if (stem.length >= 6) {
    const pre = stem.slice(0, 6);
    for (const f of Object.keys(voc)) if (f.startsWith(pre) && f.length <= stem.length + 5) await add(f, 0.8);
  } else {
    const bases = [stem];
    if (stem.endsWith('e')) bases.push(stem.slice(0, -1));
    for (const b of bases) for (const suf of SUFFIXES) if (suf !== 'd' || b.endsWith('e')) await add(b + suf, 0.8);
  }
  for (const f of RELATED[word] || RELATED[stem] || []) await add(f, 0.6);
  return { forms, vocab };
}

// verse id range covered by a topic entry reference, capped so a long range does not flood the results
async function refVerses(a, z, cap = 8) {
  const [b, c1, v1] = parts(a); const [, c2, v2] = parts(z);
  const ch = (await chapters())[osis(b)] || [];
  const out = [];
  for (let c = c1; c <= c2 && out.length < cap; c++) {
    const last = c === c2 ? Math.min(v2, ch[c - 1] || 0) : (ch[c - 1] || 0);
    for (let v = c === c1 ? v1 : 1; v <= last && out.length < cap; v++) out.push(vid(b, c, v));
  }
  return out;
}

const wordRe = (f) => new RegExp(`\\b${f}\\b`);

export async function runClaim(claim, opts = {}) {
  const pins = opts.pins || [];
  const removed = new Set(opts.removed || []);
  const words = (claim.toLowerCase().match(/[a-z]+/g) || []);
  const universal = words.some((w) => QUANT.has(w));
  const kws = keywords(claim);
  const df = await meta.df();
  const en2s = await meta.en2strong();

  // 1. concepts
  const concepts = [];
  for (const k of kws) {
    const { forms, vocab } = await family(k);
    const verses = new Map();
    for (const [f, wt] of forms) for (const v of (await vocab(f[0]))[f] || []) if ((verses.get(v) || 0) < wt) verses.set(v, wt);
    const engIdf = verses.size ? Math.log(N_VERSES / verses.size) : 0;
    // lemmas under the family (BSB alignment), counted separately for the word's own inflections,
    // its derived forms and its related words, so a large derived group cannot crowd out the word itself
    const lemmas = new Map();
    for (const [grp, minShare] of [[1, 0.12], [0.8, 0.2], [0.6, 0.3]]) {
      const counts = new Map();
      for (const [f, wt] of forms) {
        if (wt !== grp) continue;
        for (const [s, n] of en2s[f] || []) { const pk = plainKey(s); if (pk) counts.set(pk, (counts.get(pk) || 0) + n); }
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      for (const [pk, n] of ranked.slice(0, 5)) {
        if (n < 3 || n / total < minShare || lemmas.has(pk)) continue;
        lemmas.set(pk, { w: weightOf(pk, df), rel: grp });
      }
    }
    // the word after "can", "may", "must" ... is the claim's predicate and counts for more;
    // its derived forms (prophet beside prophesy) count for less, since they shift the meaning
    const at = words.indexOf(k);
    const pred = at > 0 && MODALS.has(words[at - 1]);
    if (pred) {
      for (const [f, wt] of forms) if (wt === 0.8) forms.set(f, 0.6);
      for (const [v, wt] of verses) if (wt === 0.8) verses.set(v, 0.6);
      for (const x of lemmas.values()) if (x.rel === 0.8) x.rel = 0.6;
    }
    const lemIdf = Math.max(0, ...[...lemmas.values()].map((x) => x.w));
    concepts.push({ k, forms, verses, df: verses.size, lemmas, pred, W: Math.min(8, Math.max(1.5, engIdf, lemIdf)) * (pred ? 1.6 : 1) });
  }
  if (universal) {
    concepts.push({ k: 'all', quant: true, forms: new Map(), verses: new Map(), df: 0, W: 1,
      lemmas: new Map(QUANT_LEMMAS.map((pk) => [pk, { w: 1, rel: 1 }])) });
  }
  const nC = concepts.length;
  const coreConcepts = concepts.filter((c) => !c.quant);

  // per-verse evidence: concept index -> {cov, how, detail}
  const cand = new Map();
  const ev = (v) => { if (!cand.has(v)) cand.set(v, { v, cov: new Map(), topics: [], graph: [], base: 0, g1: 0, g2: 0 }); return cand.get(v); };
  const give = (v, ci, cov, how, detail) => {
    const e = ev(v);
    const cur = e.cov.get(ci);
    if (!cur || cur.cov < cov) e.cov.set(ci, { cov, how, detail });
  };

  // 2a. English words
  concepts.forEach((c, ci) => { for (const [v, wt] of c.verses) give(v, ci, wt, 'word', ''); });
  // 2b. lemmas (every verse using them, from the lemma index)
  const lemmaInfo = [];
  for (const [ci, c] of concepts.entries()) {
    for (const [pk, x] of c.lemmas) {
      const b = await brief(pk);
      lemmaInfo.push({ pk, w: x.w, k: c.k, lemma: b ? b.l : '', gloss: b ? b.g : '', rel: x.rel, quant: !!c.quant });
      if (c.quant) continue; // quantifier lemmas are too common to search; they are read from each verse later
      if (x.w <= 0) continue;
      for (const dk of await lemmaKeysFor(pk)) for (const occ of await occurrences(dk)) give(occ.v, ci, x.rel, 'lemma', pk);
    }
  }
  // 2c. topical indexes: topics named by a claim word, and entries whose own words carry a claim word
  const tw = await meta.topicWords();
  const topics = await meta.topics();
  const tById = new Map(topics.map((t) => [t[0], t]));
  const topicHits = new Map();
  const formsRe = concepts.map((c) => [...c.forms.keys()].filter((f) => c.forms.get(f) >= 0.8).map(wordRe));
  for (const [ci, c] of concepts.entries()) {
    if (c.quant) continue;
    const main = [...c.forms.keys()].filter((f) => c.forms.get(f) >= 0.8);
    const titleTopics = new Set(); const entryTopics = new Set();
    for (const f of main) { for (const t of tw.title[f] || []) titleTopics.add(t); for (const t of (tw.entry[f] || []).slice(0, 12)) if (entryTopics.size < 30) entryTopics.add(t); }
    for (const tid of new Set([...titleTopics, ...entryTopics])) {
      const t = tById.get(tid);
      if (!t) continue;
      const isTitle = titleTopics.has(tid);
      const entries = await topicEntries(tid);
      let n = 0;
      for (const [, textE, refs] of entries) {
        const low = textE.toLowerCase();
        const mine = formsRe[ci].some((re) => re.test(low));
        const others = formsRe.map((res, j) => (j !== ci && res.some((re) => re.test(low)) ? j : -1)).filter((j) => j >= 0);
        if (!isTitle && !mine) continue;
        if (isTitle && entries.length > 60 && !mine && !others.length) continue;
        for (const [a0, z0] of refs) {
          for (const v of await refVerses(a0, z0)) {
            give(v, ci, isTitle ? 0.8 : 0.6, isTitle ? 'topic' : 'entry', `${t[2]} (${t[1] === 'nave' ? 'Nave' : 'Torrey'})`);
            for (const j of others) give(v, j, 0.6, 'entry', `${t[2]} (${t[1] === 'nave' ? 'Nave' : 'Torrey'})`);
            const e = ev(v);
            if (e.topics.length < 3) e.topics.push({ src: t[1], title: t[2], text: textE.slice(0, 120) });
            n += 1;
          }
        }
      }
      if (n) topicHits.set(tid, { tid, src: t[1], title: t[2], refs: n, title_match: isTitle });
    }
  }

  // 3. base score: rarer concepts count more, and carrying more of the claim counts much more.
  //    When the claim has a predicate ("can prophesy"), the other words count half toward coverage.
  const hasPred = coreConcepts.some((c) => c.pred);
  const part = (c) => (c.quant ? 0.5 : (hasPred && !c.pred ? 0.5 : 1));
  const kmax = concepts.reduce((a, c) => a + part(c), 0);
  const scoreBase = (e) => {
    let s = 0; let k = 0;
    for (const [ci, x] of e.cov) { s += concepts[ci].W * x.cov; k += part(concepts[ci]) * x.cov; }
    e.cover = kmax ? k / kmax : 0;
    e.base = s * (0.35 + 0.65 * e.cover * e.cover);
  };
  for (const e of cand.values()) scoreBase(e);

  // read verses word by word: quantifiers ("all") and negations standing directly before the claim's words
  const coreLemmas = new Set(coreConcepts.flatMap((c) => [...c.lemmas.keys()]));
  const scopeLemmas = new Set((hasPred ? coreConcepts.filter((c) => c.pred) : coreConcepts).flatMap((c) => [...c.lemmas.keys()]));
  const derivedPred = new Set(coreConcepts.filter((c) => c.pred).flatMap((c) => [...c.lemmas.entries()].filter(([, x]) => x.rel < 1).map(([pk]) => pk)));
  const qi = universal ? concepts.length - 1 : -1;
  const read = new Set();
  const gl = (w) => (w[2] || '').replace(/\//g, '');
  const surface = async (v, i, j) => {
    // the words themselves, for showing why a text was flagged
    const o = await orig(v);
    const ws = o ? o.w.filter((w) => !/^[XR]/.test(w[6] || '')) : [];
    return { words: ws.slice(i, j + 1).map((w) => w[0]).join(' '), gloss: ws.slice(i, j + 1).map(gl).join(' ').trim() };
  };
  const readWords = async (e) => {
    if (read.has(e.v)) return;
    read.add(e.v);
    const nums = await seq(e.v);
    if (!nums) return;
    const pre = parts(e.v)[0] >= NT_START ? 'G' : 'H';
    const keys = nums.map((n) => (n ? `${pre}${n}` : null));
    // "all" counts fully only within three words of the claim's predicate (or of any claim word)
    const anchor = keys.map((k, i) => (scopeLemmas.has(k) ? i : -1)).filter((i) => i >= 0);
    for (let i = 0; i < keys.length; i++) {
      if (universal && QUANT_LEMMAS.includes(keys[i])) {
        const near = anchor.some((j) => Math.abs(j - i) <= 3);
        // "all the prophets" quantifies the predicate's own derived noun, not the people the claim is about
        const nextNoun = keys[i + 1] === 'G3588' ? keys[i + 2] : keys[i + 1];
        const ofDerived = derivedPred.has(nextNoun);
        give(e.v, qi, near && !ofDerived ? 1 : 0.3, 'lemma', keys[i]);
      }
      if (!NEG_LEMMAS.has(keys[i]) || i + 1 >= keys.length) continue;
      const next = keys[i + 1];
      if (universal && QUANT_LEMMAS.includes(next)) e.flag = { rule: 'quantifier', at: [i, i + 1] };
      else if (coreLemmas.has(next) && !e.flag) e.negNext = { at: [i, i + 1] };
    }
    scoreBase(e);
  };
  const mk = await getJSON('idx/markers.json');
  const negBits = mk.m.reduce((acc, k, i) => (NEG_LEMMAS.has(k) ? acc | (1 << i) : acc), 0);
  const byBase = [...cand.values()].filter((x) => !removed.has(x.v) && x.cov.size).sort((a, b) => b.base - a.base);
  for (const e of byBase.slice(0, 500)) await readWords(e);
  for (const e of byBase.slice(500).filter((x) => mk.v[x.v] & negBits).slice(0, 150)) await readWords(e);

  // neighbouring verses that carry the claim join into passages (at most 6 verses, never across a chapter)
  const chs = await chapters();
  const merge = (list, val) => {
    const byV = new Map(list.map((e) => [e.v, e]));
    const used = new Set();
    const out = [];
    for (const e of list) {
      if (used.has(e.v)) continue;
      const [b, c, v0] = parts(e.v);
      let a = v0; let z = v0;
      const ok = (x) => { const id = vid(b, c, x); return byV.has(id) && !used.has(id) && !!byV.get(id).flag === !!e.flag; };
      const last = (chs[osis(b)] || [])[c - 1] || 0;
      for (;;) {
        if (z - a < 5 && ok(z + 1)) z += 1;
        else if (z - a < 4 && z + 2 <= last && ok(z + 2) && !byV.has(vid(b, c, z + 1))) z += 2; // one quiet verse between
        else break;
      }
      for (;;) {
        if (z - a < 5 && ok(a - 1)) a -= 1;
        else if (z - a < 4 && a - 2 >= 1 && ok(a - 2) && !byV.has(vid(b, c, a - 1))) a -= 2;
        else break;
      }
      const members = [];
      for (let x = a; x <= z; x++) {
        const id = vid(b, c, x);
        used.add(id);
        members.push(byV.get(id) || { v: id, cov: new Map(), topics: [], graph: [], base: 0, score: 0, g1: 0, g2: 0, cover: 0, quiet: true });
      }
      const best = members.reduce((m, x) => (val(x) > val(m) ? x : m), members[0]);
      const extra = members.filter((x) => x !== best && !x.quiet).reduce((sum, x) => sum + val(x), 0);
      out.push({ a: vid(b, c, a), z: vid(b, c, z), v: best.v, members, score: val(best) + 0.25 * Math.min(extra, val(best)) });
    }
    return out.sort((x, y) => y.score - x.score);
  };

  // 4. cross-reference graph: weight flows from the strongest passages to the verses they link to (two steps)
  const prelim = merge([...cand.values()].filter((e) => !removed.has(e.v) && e.base > 0 && e.cov.size).sort((a, b) => b.base - a.base), (e) => e.base);
  // seeds are passages carrying more than one part of the claim, so a crowd of passages that share a
  // single word cannot lift one another
  const rich = prelim.filter((p) => Math.max(...p.members.map((m) => m.cover || 0)) >= 0.6);
  const seedPassages = (rich.length >= 8 ? rich : [...rich, ...prelim.filter((p) => !rich.includes(p))]).slice(0, 25);
  const inSeed = new Set(seedPassages.flatMap((p) => p.members.map((m) => m.v)));
  // quotations and allusions carry more; links that share none of the claim's lemmas carry less
  const claimLemmaSet = new Set(coreConcepts.flatMap((c) => [...c.lemmas.keys()]));
  const TYPE_FACTOR = { q: 1.5, a: 1.3, t: 1.2, l: 1, e: 0.8 };
  const linkFactor = (r) => {
    const shares = (r[8] || []).some(([pk]) => claimLemmaSet.has(pk));
    return (TYPE_FACTOR[r[2]] || 1) * (shares ? 1.2 : (r[2] === 'l' || r[2] === 'e' ? 0.7 : 1));
  };
  for (const p of seedPassages) {
    const gain = new Map();
    for (const m of p.members) {
      if (m.quiet) continue;
      for (const r of await xrefs(m.v)) {
        const [b0, b1, typ, score] = r;
        if (score < 25) continue;
        for (let t = b0; t <= b1 && t - b0 < 6; t++) {
          if (t >= p.a && t <= p.z) continue;
          const g = p.score * Math.min(1, score / 100) * linkFactor(r);
          if (!gain.has(t) || gain.get(t).g < g) gain.set(t, { g, from: m.v, typ, score });
        }
      }
    }
    for (const [t, x] of gain) { const e = ev(t); (e.g1s = e.g1s || []).push(x.g); e.graph.push({ from: x.from, typ: x.typ, score: x.score, step: 1 }); }
  }
  // several passages linking to a verse count, but only the three strongest, so a large cluster of
  // similar passages cannot lift itself
  for (const e of cand.values()) if (e.g1s) e.g1 = e.g1s.sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const hop = [...cand.values()].filter((e) => e.g1 > 0 && !inSeed.has(e.v)).sort((a, b) => b.g1 - a.g1).slice(0, 25);
  for (const m of hop) {
    const via = m.graph.filter((g) => g.step === 1).sort((a, b) => b.score - a.score)[0];
    for (const r of await xrefs(m.v)) {
      const [b0, b1, typ, score] = r;
      if (score < 35) continue;
      for (let t = b0; t <= b1 && t - b0 < 6; t++) {
        if (t === m.v) continue;
        const e = ev(t);
        e.g2 = Math.max(e.g2, m.g1 * Math.min(1, score / 100) * linkFactor(r)); // the strongest two-step path
        e.graph.push({ from: m.v, typ, score, step: 2, via: via ? via.from : null });
      }
    }
  }
  for (const e of cand.values()) {
    if (e.cover === undefined) scoreBase(e);
    e.score = e.base + 0.4 * e.g1 + 0.15 * e.g2;
  }
  const top = [...cand.values()].filter((e) => !removed.has(e.v)).sort((a, b) => b.score - a.score).slice(0, 250);
  for (const e of top) { await readWords(e); e.score = e.base + 0.4 * e.g1 + 0.15 * e.g2; }

  // 5. tension rules: a negation directly before the claim's words (in a verse carrying at least two of them),
  //    a negation directly before "all" for a universal claim, or, in a text linked to a flagged text,
  //    a negation within two words before the claim's words
  for (const e of cand.values()) if (!e.flag && e.negNext && e.cov.size >= 2) e.flag = { rule: 'negation', at: e.negNext.at };
  const flagged = new Set([...cand.values()].filter((e) => e.flag && e.flag.rule === 'negation').map((e) => e.v));
  for (const e of top) {
    if (e.flag || e.cov.size < 2) continue;
    const link = e.graph.find((g) => g.step === 1 && g.score >= 40 && flagged.has(g.from));
    if (!link) continue;
    const nums = await seq(e.v);
    if (!nums) continue;
    const pre = parts(e.v)[0] >= NT_START ? 'G' : 'H';
    const keys = nums.map((n) => (n ? `${pre}${n}` : null));
    for (let i = 0; i < keys.length && !e.flag; i++) {
      if (!NEG_LEMMAS.has(keys[i])) continue;
      for (const j of [i + 1, i + 2]) {
        if (j < keys.length && coreLemmas.has(keys[j])) { e.flag = { rule: 'linked', from: link.from, score: link.score, at: [i, j] }; break; }
      }
    }
  }
  // the flagged words themselves, for the report
  for (const e of cand.values()) if (e.flag && e.flag.at) Object.assign(e.flag, await surface(e.v, e.flag.at[0], e.flag.at[1]));

  // 6. final passages, each with 3 verses of context on either side (within its chapter)
  const pool = top.filter((e) => e.score > 0 && (e.cov.size || e.graph.length));
  const passages = merge(pool, (e) => e.score).map((p) => {
    const [b, c] = parts(p.a);
    const last = (chs[osis(b)] || [])[c - 1] || parts(p.z)[2];
    return {
      ...p,
      ctx: [vid(b, c, Math.max(1, parts(p.a)[2] - 3)), vid(b, c, Math.min(last, parts(p.z)[2] + 3))],
      flag: p.members.find((x) => x.flag)?.flag || null,
      cover: Math.max(...p.members.map((x) => x.cover || 0)),
      direct: p.members.some((x) => [...x.cov.entries()].filter(([ci, y]) => !concepts[ci].quant && (y.how === 'word' || y.how === 'lemma')).length >= Math.min(2, coreConcepts.length)),
      graphOnly: p.members.every((x) => !x.cov.size || [...x.cov.keys()].every((ci) => concepts[ci].quant)),
    };
  });

  // 7. groups. Supporting passages in one chapter are shown together as one entry, so a chapter that
  //    speaks to the claim again and again (1 Corinthians 14, Isaiah 53) is seen as a whole
  const entryOf = (ps) => {
    const byScore = [...ps].sort((x, y) => y.score - x.score);
    const ordered = [...ps].sort((x, y) => x.a - y.a);
    return {
      parts: ordered, v: byScore[0].v, a: ordered[0].a, z: ordered[ordered.length - 1].z,
      score: byScore.slice(0, 3).reduce((sum, p, i) => sum + p.score * [1, 0.35, 0.2][i], 0),
      direct: ps.some((p) => p.direct), cover: Math.max(...ps.map((p) => p.cover || 0)),
      members: ps.flatMap((p) => p.members),
    };
  };
  const supportPool = passages.filter((p) => !p.flag);
  const byChapter = new Map();
  for (const p of supportPool.filter((x) => !x.graphOnly)) {
    const [b, c] = parts(p.a);
    const k = b * 1000 + c;
    if (!byChapter.has(k)) byChapter.set(k, []);
    byChapter.get(k).push(p);
  }
  const supporting = [...byChapter.values()].map(entryOf).sort((x, y) => y.score - x.score).slice(0, 20);
  // tension texts come from every verse the rules flagged, not only the strongest
  const tension = merge([...cand.values()].filter((e) => e.flag && !removed.has(e.v) && e.cov.size), (e) => e.score).map((p) => {
    const [b, c] = parts(p.a);
    const last = (chs[osis(b)] || [])[c - 1] || parts(p.z)[2];
    return { ...p, ctx: [vid(b, c, Math.max(1, parts(p.a)[2] - 3)), vid(b, c, Math.min(last, parts(p.z)[2] + 3))], flag: p.members.find((x) => x.flag)?.flag || null, direct: true, parts: null };
  }).slice(0, 10);
  for (const t of tension) t.parts = [t];
  // texts reached only through the graph: at most two by way of any one passage, so one strong passage
  // cannot fill the list
  const linked = [];
  const perSource = new Map();
  const sourceOf = (p) => {
    const g = p.members.flatMap((m) => m.graph || []).sort((x, y) => y.score - x.score)[0];
    if (!g) return 'none';
    const sp = seedPassages.find((q) => g.from >= q.a && g.from <= q.z) || hop.find((q) => q.v === g.from);
    return sp ? `${sp.a || sp.v}` : `${g.from}`;
  };
  for (const p of supportPool.filter((x) => x.graphOnly)) {
    const k = sourceOf(p);
    if ((perSource.get(k) || 0) >= 2) continue;
    perSource.set(k, (perSource.get(k) || 0) + 1);
    linked.push({ ...p, parts: [p] });
    if (linked.length >= 8) break;
  }
  // a New Testament passage that applies an Old Testament text found here opens with its context
  const otFound = new Set(passages.filter((p) => parts(p.v)[0] < NT_START).flatMap((p) => p.members.map((m) => m.v)));
  for (const entry of [...supporting, ...linked, ...tension]) {
    for (const p of entry.parts) {
      if (parts(p.v)[0] < NT_START) continue;
      for (const m of p.members) {
        if (m.quiet) continue;
        for (const r of await xrefs(m.v)) {
          const [b0, b1, , score] = r;
          if (score < 30 || parts(b0)[0] >= NT_START) continue;
          for (let t = b0; t <= b1; t++) if (otFound.has(t)) { p.applies = p.applies || []; if (!p.applies.includes(t)) p.applies.push(t); }
        }
      }
    }
  }
  // pins by hand
  for (const pin of pins.filter((x) => x.tier === 1)) {
    const list = pin.as === 'tension' ? tension : supporting;
    const have = list.find((en) => en.parts.some((p) => pin.v >= p.a && pin.v <= p.z));
    if (have) { have.pinned = true; continue; }
    const [b, c, vv] = parts(pin.v);
    const last = (chs[osis(b)] || [])[c - 1] || vv;
    const e = cand.get(pin.v) || { v: pin.v, cov: new Map(), topics: [], graph: [], score: 0 };
    const p = { a: pin.v, z: pin.v, v: pin.v, members: [e], score: e.score || 0, pinned: true, ctx: [vid(b, c, Math.max(1, vv - 3)), vid(b, c, Math.min(last, vv + 3))], flag: pin.as === 'tension' ? { rule: 'pinned' } : null, direct: false };
    list.unshift({ ...p, parts: [p] });
  }

  // 8. variant dependencies
  const claimLemmas = new Set(lemmaInfo.filter((l) => l.w > 0 && !l.quant).map((l) => l.pk));
  const ai = await meta.ai();
  const variants = [];
  for (const entry of [...supporting, ...tension, ...linked]) {
    for (const p of entry.parts) {
      for (const m of p.members) {
        if (m.quiet) continue;
        const vd = await variantCheck(m.v, claimLemmas, ai);
        if (vd.length) variants.push({ v: m.v, notes: vd, group: p.flag ? 'tension' : 'support' });
      }
    }
  }

  // 9. tier warnings
  const warnings = [];
  const lowTier = pins.filter((p) => p.tier > 1);
  const lowSupport = lowTier.filter((p) => p.as !== 'tension');
  if (!supporting.length && !linked.length && lowSupport.length) warnings.push('Only Tier 2 to 4 texts support this claim in the current set. No Scripture text does. Tier 2 to 4 can illuminate, confirm or complicate a reading, but they cannot carry a claim alone.');
  for (const p of lowTier) warnings.push(`${p.label} is Tier ${p.tier} (${['', 'Scripture', 'textual witness', 'Jewish background', 'early church reception'][p.tier]}). It is shown beside the evidence, never counted as support from Scripture.`);
  for (const x of variants) for (const n of x.notes) if (n.tier2) warnings.push(`${label(x.v)}: ${n.text}`);

  // 10. weight summary in plain words, never a verdict
  const direct = supporting.filter((p) => p.direct).length;
  const indirect = supporting.length - direct;
  const vlist = [...new Set(variants.filter((x) => x.group === 'support').map((x) => label(x.v)))];
  let weight;
  if (!supporting.length && !linked.length) weight = 'No supporting Scripture texts found by the offline search. Try other words, or pin texts by hand.';
  else {
    weight = `Direct support from ${direct} text${direct === 1 ? '' : 's'} in context`;
    if (indirect) weight += `; ${indirect} more by topic or partial wording`;
    if (linked.length) weight += `; ${linked.length} reached only through cross-references`;
    weight += `; ${tension.length} tension text${tension.length === 1 ? '' : 's'}`;
    weight += vlist.length ? `; variant dependency at ${vlist.join(', ')}.` : '; no variant dependency.';
    if (warnings.length) weight += ` ${warnings.length} tier warning${warnings.length === 1 ? '' : 's'}.`;
  }
  return {
    claim, universal, concepts: concepts.map((c) => ({ k: c.k, quant: !!c.quant, df: c.df, W: c.W, forms: [...c.forms.entries()], lemmas: [...c.lemmas.keys()] })),
    lemmas: lemmaInfo, topics: [...topicHits.values()].sort((a, b) => b.refs - a.refs).slice(0, 12),
    supporting, linked, tension, variants, warnings, weight, lowTier, conceptNames: concepts.map((c) => c.k),
    ...(opts.debug ? { _cand: cand } : {}),
  };
}

// variant notes for one verse, limited to the words that carry the claim when the claim's lemmas are known
export async function variantCheck(v, claimLemmas, ai) {
  const out = [];
  const o = await orig(v);
  const nt = parts(v)[0] >= NT_START;
  const carries = (pk) => !claimLemmas.size || claimLemmas.has(pk);
  if (o) {
    // word-level notes only for the words that carry the claim; whole-verse notes always
    const use = claimLemmas.size ? o.w.filter((w) => carries(plainKey(w[3]))) : o.w;
    if (nt) {
      const info = await editionInfo(v, o);
      if (info && (info.whole || info.brackets)) {
        out.push({ text: `${info.lines.join(' ')} In: ${info.inList.join(', ') || 'no listed edition'}.${info.missing.length ? ` Not in: ${info.missing.join(', ')}.` : ''}` });
      } else {
        const notNA = use.filter((w) => !/N/.test(w[6]));
        const notTR = use.filter((w) => !/K/.test(w[6]));
        const bracketed = use.filter((w) => /\(K\)|\(O\)|\(N\)/.test(w[6]));
        if (notNA.length) out.push({ text: `${notNA.length} word${notNA.length > 1 ? 's' : ''} here (${notNA.slice(0, 4).map((w) => w[2]).join(', ')}) are not counted as Nestle-Aland text; they stand in ${editionsText(notNA[0])}.` });
        if (notTR.length) out.push({ text: `${notTR.length} word${notTR.length > 1 ? 's' : ''} (${notTR.slice(0, 4).map((w) => w[2]).join(', ')}) are not in the Textus Receptus (the KJV's Greek).` });
        if (bracketed.length && !notNA.length && !notTR.length) out.push({ text: `Manuscripts differ on ${bracketed.length} word${bracketed.length > 1 ? 's' : ''} here (${bracketed.slice(0, 3).map((w) => w[2]).join(', ')}).` });
      }
      if (o.g && /⟦/.test(o.g)) out.push({ text: 'The SBLGNT prints this verse in double brackets (text its editor judges a later addition).' });
    } else {
      const x = use.filter((w) => /^X/.test(w[6]));
      const qk = use.filter((w) => /^[QK]/.test(w[6]) || /\(/.test(w[6]));
      if (x.length) out.push({ text: `${x.length} Hebrew word${x.length > 1 ? 's' : ''} here are reconstructed from the Septuagint (STEPBible "X"), not in the Leningrad Codex.`, tier2: true });
      if (qk.length) out.push({ text: `${qk.length} word${qk.length > 1 ? 's' : ''} follow a Masoretic marginal reading or have recorded variants (${qk.slice(0, 3).map((w) => `${w[2]} [${w[6]}]`).join(', ')}).` });
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

// Named works outside Scripture, for hand pins: [pattern, tier, name, bundled in Threads]
export const NAMED_WORKS = [
  [/^(1\s*En(och)?|I\s*Enoch|Ethiopic\s+Enoch)\b/i, 3, '1 Enoch', false],
  [/^(2\s*En(och)?)\b/i, 3, '2 Enoch', false],
  [/^Jub(ilees)?\.?\b/i, 3, 'Jubilees', false],
  [/^(Josephus|Ant(iquities)?\.?|Jewish\s+War|J\.\s*W\.|Against\s+Apion)\b/i, 3, 'Josephus', true],
  [/^Philo\b/i, 3, 'Philo', false],
  [/^(Sirach|Ecclesiasticus|Wisdom(\s+of\s+Solomon)?|Tobit|Judith|[12]\s*Macc(abees)?|Baruch|Psalms\s+of\s+Solomon|4\s*Ezra|2\s*Baruch|Testaments?\s+of)\b/i, 3, 'Second Temple text', false],
  [/^(Targum|Tg\.?|Onkelos|Pseudo-Jonathan|Neofiti)\b/i, 2, 'Targum', false],
  [/^(Samaritan\s+Pentateuch)\b/i, 2, 'Samaritan Pentateuch', false],
  [/^(Didache|1\s*Clem(ent)?|2\s*Clem(ent)?|Ignatius|Polycarp|Barnabas|Hermas|Shepherd|Diognetus|Papias)\b/i, 4, 'Apostolic Fathers', false],
  [/^(Justin|Irenaeus|Tertullian|Clement\s+of\s+Alexandria|Origen|Hippolytus|Cyprian|Athenagoras|Theophilus|Tatian|Methodius|Lactantius)\b/i, 4, 'Ante-Nicene Fathers', true],
];
export function namedWork(s) {
  for (const [re, tierN, name, bundled] of NAMED_WORKS) if (re.test(s.trim())) return { tier: tierN, name, bundled };
  return null;
}

export { keyOf, rangeLabel };
