// Self-test: each check reads the same data and code the app uses.
import * as D from './data.js';
import * as R from './refs.js';
import { runClaim, variantCheck, namedWork } from './claim.js';
import { diffWords } from './views.js';
import { linksFor, weightOf } from './links.js';
import { toSermon } from './trail.js';
import { ai as aiBox } from './ui.js';

const tests = [];
let GROUP = 'Acceptance tests (from the Threads specification)';
const test = (name, fn) => tests.push({ name, fn, group: GROUP });
const V = (osis) => R.parseOsis(osis);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };


// ============================================================== acceptance tests
const FIX = () => D.getJSON('meta/fixtures.json');
const SETTINGS_KEY = 'threads.settings.v1';
async function withSettings(obj, fn) {
  let prev = null;
  try { prev = localStorage.getItem(SETTINGS_KEY); localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj)); } catch { /* ignore */ }
  try { return await fn(); } finally { try { if (prev === null) localStorage.removeItem(SETTINGS_KEY); else localStorage.setItem(SETTINGS_KEY, prev); } catch { /* ignore */ } }
}
const squeeze = (t) => (t || '').replace(/\s+/g, ' ').trim();
let frameN = 0;
async function openReader(osis, ready) {
  const f = document.getElementById('app');
  frameN += 1;
  const tag = `t=${frameN}`;
  f.src = `index.html?${tag}#/read/${osis}`;
  // wait for the new page, not the one still showing from the previous check
  await waitFor(() => f.contentDocument && f.contentWindow.location.href.includes(tag) && f.contentDocument.readyState === 'complete' && f.contentDocument.querySelector('h1') && ready(f.contentDocument), 25000);
  return f.contentDocument;
}

test('Verse counts per book match the source data (BSB, WEB, KJV, Hebrew TAHOT, Greek TAGNT)', async () => {
  const fx = await FIX();
  const bad = []; const tot = { bsb: 0, web: 0, kjv: 0, orig: 0 };
  for (const [osis] of R.BOOKS) {
    const t = await D.getJSON(`text/${osis}.json`); const o = await D.getJSON(`orig/${osis}.json`);
    const n = { bsb: 0, web: 0, kjv: 0, orig: 0 };
    for (const [k, e] of Object.entries(t.v)) {
      if (k.endsWith(':0')) continue;
      if (e.bsb && e.bsb.length) n.bsb += 1;
      if (e.web) n.web += 1;
      if (e.kjv) n.kjv += 1;
    }
    for (const e of Object.values(o.v)) if (e.w && e.w.length) n.orig += 1;
    for (const k of Object.keys(n)) { tot[k] += n[k]; if (n[k] !== fx.counts[osis][k]) bad.push(`${osis} ${k}: app ${n[k]}, source ${fx.counts[osis][k]}`); }
  }
  assert(!bad.length, bad.slice(0, 8).join('; '));
  return `66 books match in all five sources. Totals: BSB ${tot.bsb}, WEB ${tot.web}, KJV ${tot.kjv}, Hebrew and Greek ${tot.orig}`;
});
test('English Joel 2:28 maps to Hebrew Joel 3:1', async () => {
  const hr = await D.hebRef(V('Joel.2.28'));
  assert(hr === '3.1', `Hebrew reference ${hr}`);
  const doc = await openReader('Joel.2.28', (d) => d.querySelectorAll('.verse').length >= 1);
  const note = doc.querySelector('.note-heb');
  assert(note && /3:1/.test(note.textContent), `reader note: ${note ? note.textContent : 'missing'}`);
  return `${note.textContent.trim()}; TAHOT words for English 2:28 open "${(await D.orig(V('Joel.2.28'))).w.slice(0, 3).map((w) => w[0]).join(' ')}"`;
});
test('Psalm numbering maps correctly between the Hebrew and the Septuagint (every verse in STEPBible TVTMS)', async () => {
  const fx = await FIX();
  const lxx = (await D.getJSON('lxx/Ps.json')).v;
  const bad = []; const noGreek = [];
  for (const [e, hh, g] of fx.psalms) {
    const [c, v] = e.split(':').map(Number);
    const ah = ((await D.hebRef(R.vid(19, c, v))) || e.replace(':', '.')).replace('.', ':');
    if (ah !== hh) bad.push(`English ${e}: Hebrew ${ah}, TVTMS ${hh}`);
    const rec = lxx[e];
    if (!rec || !rec[0]) { noGreek.push(e); continue; }
    const ag = rec[2] || e;
    if (ag !== g) bad.push(`English ${e}: Septuagint ${ag}, TVTMS ${g}`);
  }
  assert(!bad.length, bad.slice(0, 8).join('; '));
  const ex = (e) => { const r = fx.psalms.find((x) => x[0] === e); return r ? `English ${r[0]} = Hebrew ${r[1]} = LXX ${r[2]}` : ''; };
  return `${fx.psalms.length} verses agree. ${ex('51:1')}; ${ex('10:1')}; ${ex('116:10')}; ${ex('147:12')}. No Greek in the Swete transcription at ${noGreek.join(', ')} (shown as no data).`;
});
test('20 random verses render identically to the upstream files (BSB, WEB, KJV, Hebrew or Greek)', async () => {
  const fx = await FIX();
  const pool = [...fx.sample];
  const pick = [];
  while (pick.length < 20 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const bad = []; let fields = 0;
  await withSettings({ web: true, kjv: true, orig: true }, async () => {
    for (const s of pick) {
      const v = V(s.v);
      const doc = await openReader(s.v, (d) => d.getElementById(`v${v}`));
      const box = doc.getElementById(`v${v}`);
      const textOf = (el) => squeeze([...el.childNodes].filter((n) => !(n.classList && (n.classList.contains('vn') || n.tagName === 'B'))).map((n) => n.textContent).join(''));
      let bsb = textOf(box.querySelector('.bsb'));
      const title = doc.getElementById(`v${v - R.parts(v)[2]}`);
      if (title && R.parts(v)[2] === 1) bsb = squeeze(`${textOf(title.querySelector('.bsb'))} ${bsb}`);
      const alts = [...box.querySelectorAll('.alt')];
      const web = alts.find((a) => /^WEB/.test(a.textContent)); const kjv = alts.find((a) => /^KJV/.test(a.textContent));
      const checks = [['BSB', bsb, s.bsb]];
      if (s.web) checks.push(['WEB', web ? textOf(web) : '', s.web]);
      if (s.kjv) checks.push(['KJV', kjv ? textOf(kjv) : '', s.kjv]);
      if (s.heb) checks.push(['Hebrew', squeeze([...box.querySelectorAll('.lit .o')].map((x) => x.textContent).join(' ')), s.heb]);
      if (s.grk) checks.push(['Greek', squeeze((box.querySelector('.grk-text') || {}).textContent), s.grk]);
      for (const [name, got, want] of checks) { fields += 1; if (got !== squeeze(want)) bad.push(`${s.v} ${name}: shows "${got.slice(0, 60)}" but source has "${squeeze(want).slice(0, 60)}"`); }
    }
  });
  assert(!bad.length, bad.slice(0, 4).join(' | '));
  return `${pick.length} verses, ${fields} texts identical: ${pick.map((x) => x.v).join(', ')}`;
});
test('The five Dead Sea Scrolls variants appear with correct citations', async () => {
  const fx = await FIX();
  const out = [];
  const ai = await D.meta.ai();
  const fmt = (labels) => {
    const by = new Map();
    for (const l of labels) { const i = l.lastIndexOf(':'); const f = l.slice(0, i); if (!by.has(f)) by.set(f, []); by.get(f).push(+l.slice(i + 1)); }
    return [...by].map(([f, ns]) => [f.startsWith('f') ? `frag. ${f.slice(1)}` : `col. ${f}`, Math.min(...ns), Math.max(...ns)]);
  };
  const where = { '4Q37': ['Deut.32.8', 'Deut.32.8'], '4Q51': ['1Sam.10.27', '1Sam.10.27'], '11Q5': ['Ps.145.13', 'Ps.145.13'], '1Qisaa': ['Isa.53.11', 'Isa.53.11'], '1Q8': ['Isa.53.11', 'Isa.53.11'], '4Q71': ['Jer.10.5', 'Jer.10.5'] };
  for (const d of fx.dss) {
    const [osis, noteKey] = where[d.scroll];
    const key = osis.split('.').slice(1).join(':');
    const doc = await openReader(osis, (x) => [...x.querySelectorAll('.vtools .chip')].some((b) => /Scrolls/.test(b.textContent)));
    [...doc.querySelectorAll('.vtools .chip')].find((b) => /Scrolls/.test(b.textContent)).click();
    await waitFor(() => doc.querySelector(`.dss-card[data-scroll="${d.scroll}"]`));
    const card = doc.querySelector(`.dss-card[data-scroll="${d.scroll}"]`);
    const citeText = card.querySelector('.dss-cite').textContent;
    assert(citeText.includes(d.siglum) && citeText.includes(d.scroll), `${d.label}: citation "${citeText}" lacks ${d.scroll} (${d.siglum})`);
    for (const [lab, a, z] of fmt(d.verses[key] || [])) {
      const want = a === z ? `${lab}, line ${a}` : `${lab}, lines ${a}-${z}`;
      assert(citeText.includes(want), `${d.label}: citation "${citeText}" lacks "${want}" (Text-Fabric)`);
    }
    const note = ai.dss_notes[osis === 'Jer.10.5' ? 'Jer.10.5' : osis];
    assert(note, `${d.label}: no note`);
    assert(doc.querySelector('.sheet .ai, #sheet-body .ai'), `${d.label}: note not shown as AI text`);
    out.push(citeText);
  }
  return out.join(' | ');
});
test('TAGNT edition flags display for Acts 8:37 and Mark 16:9-20', async () => {
  const fx = await FIX();
  const names = { NA28: 'NA28', NA27: 'NA27', Tyn: 'Tyndale House GNT', SBL: 'SBLGNT', WH: 'Westcott-Hort', Treg: 'Tregelles', TR: 'Textus Receptus', Byz: 'Byzantine' };
  const seen = [];
  for (const [osis, e] of Object.entries(fx.editions)) {
    const v = V(osis);
    const doc = await openReader(osis, (d) => d.getElementById(`v${v}`));
    const flag = doc.getElementById(`v${v}`).querySelector('.edflag');
    assert(flag, `${osis}: no edition flag shown`);
    const shown = flag.dataset.editions.split('|').filter(Boolean);
    const want = e.any.map((x) => names[x]);
    assert(shown.join(',') === want.join(','), `${osis}: flag lists ${shown.join(', ')}; TAGNT lists ${want.join(', ')}`);
    if (osis === 'Acts.8.37') assert(/only in the Textus Receptus/.test(flag.textContent), 'Acts 8:37: flag does not say Textus Receptus only');
    else assert(/[Dd]ouble brackets/.test(flag.textContent), `${osis}: flag does not mention the double brackets`);
    seen.push(osis.replace('.', ' ').replace('.', ':'));
  }
  return `${seen.length} verses flagged: ${seen.join(', ')}`;
});
const where = (res, v) => {
  for (const [name, list] of [['support', res.supporting], ['linked', res.linked], ['tension', res.tension]]) {
    for (const en of list) for (const p of en.parts) if (v >= p.a && v <= p.z) return { group: name === 'linked' ? 'support' : name, p, en };
  }
  return null;
};
const verdictWords = /\b(true|false|proven|disproven|correct|incorrect|wrong|right)\b/i;
test('Claim test: "Every believer can prophesy" surfaces Num 11:29, Joel 2:28, Acts 2:17-18 and 1 Cor 14:1, 5, 24, 31 as support, and 1 Cor 12:29 as tension', async () => {
  const res = await runClaim('Every believer can prophesy');
  const miss = [];
  for (const r of ['Num.11.29', 'Joel.2.28', 'Acts.2.17', 'Acts.2.18', '1Cor.14.1', '1Cor.14.5', '1Cor.14.24', '1Cor.14.31']) { const w = where(res, V(r)); if (!w || w.group !== 'support') miss.push(`${r} ${w ? `in ${w.group}` : 'not found'}`); }
  const t = where(res, V('1Cor.12.29'));
  if (!t || t.group !== 'tension') miss.push(`1Cor.12.29 ${t ? `in ${t.group}` : 'not found'}`);
  assert(!miss.length, miss.join('; '));
  assert(!verdictWords.test(res.weight), res.weight);
  return `${res.weight} 1 Cor 12:29 flagged: ${t.p.flag.words} ("${t.p.flag.gloss}").`;
});
test('Claim test: "Healing is in the atonement" surfaces Isa 53:4-5 and Matt 8:16-17 as support, and 1 Pet 2:24 with its context 2:21-25', async () => {
  const res = await runClaim('Healing is in the atonement');
  const miss = [];
  for (const r of ['Isa.53.4', 'Isa.53.5', 'Matt.8.16', 'Matt.8.17', '1Pet.2.24']) { const w = where(res, V(r)); if (!w || w.group !== 'support') miss.push(`${r} ${w ? `in ${w.group}` : 'not found'}`); }
  assert(!miss.length, miss.join('; '));
  const pe = where(res, V('1Pet.2.24')).p;
  assert(pe.ctx[0] <= V('1Pet.2.21') && pe.ctx[1] >= V('1Pet.2.25'), `context ${R.rangeLabel(pe.ctx[0], pe.ctx[1])}`);
  assert(pe.applies && pe.applies.some((x) => R.parts(x)[0] === 23), '1 Pet 2:24 is not shown as applying Isaiah, so its context does not open');
  return `${res.weight} 1 Peter shown as ${R.rangeLabel(pe.a, pe.z)} in context ${R.rangeLabel(pe.ctx[0], pe.ctx[1])}, applying ${pe.applies.filter((x) => R.parts(x)[0] === 23).map(R.label).join(', ')}.`;
});
test('Claim test: "Children bear their parents\' guilt" surfaces Exod 20:5 and 34:7, Ezek 18:20, Deut 24:16 and Gal 3:13', async () => {
  const res = await runClaim("Children bear their parents' guilt");
  const got = []; const miss = [];
  for (const r of ['Exod.20.5', 'Exod.34.7', 'Ezek.18.20', 'Deut.24.16', 'Gal.3.13']) { const w = where(res, V(r)); if (w) got.push(`${r} (${w.group})`); else miss.push(r); }
  assert(!miss.length, `Found ${got.join(', ')}. Not surfaced: ${miss.join(', ')}. ${miss.includes('Gal.3.13') ? 'The data ties Gal 3:13 to this claim only through Torrey’s entry "Bore the curse of" (one of the claim’s four words) and a two-step link (Ezek 18:20 to 1 Pet 2:24 to Gal 3:13); the claim test does not reach it without wording that names the curse. Pin it by hand.' : ''}`);
  return `${got.join(', ')}. ${res.weight}`;
});
test('Tier rule: a claim supported only by 1 Enoch triggers the tier warning', async () => {
  const nw = namedWork('1 Enoch 8:1');
  assert(nw && nw.tier === 3, `1 Enoch read as ${JSON.stringify(nw)}`);
  const res = await runClaim('Azazel and Semjaza are Grigori', { pins: [{ tier: nw.tier, label: '1 Enoch 8:1', as: 'support', work: nw.name, bundled: nw.bundled }] });
  assert(!res.supporting.length && !res.linked.length, `unexpected Scripture support: ${res.supporting.map((e) => R.rangeLabel(e.a, e.z)).join(', ')}`);
  const w = res.warnings.find((x) => /Only Tier 2 to 4 texts support this claim/.test(x));
  assert(w, res.warnings.join(' | '));
  const ctrl = await runClaim('Azazel and Semjaza are Grigori', { pins: [{ tier: 3, label: '1 Enoch 8:1', as: 'support' }, { tier: 1, v: V('Gen.6.4'), label: 'Genesis 6:4', as: 'support' }] });
  assert(!ctrl.warnings.some((x) => /Only Tier 2 to 4/.test(x)), 'warning shown even with Scripture pinned');
  return w;
});

// ============================================================== further checks written for Threads
GROUP = 'Further checks';
test('BSB text loads: Joel 2:28 says "I will pour out My Spirit"', async () => {
  const t = await D.bsbText(V('Joel.2.28'));
  assert(/pour out My Spirit/.test(t), t);
  return t.slice(0, 80);
});
test('Hebrew numbering is noted: Joel 2:28 to 32 is Hebrew 3:1 to 5', async () => {
  const a = await D.hebRef(V('Joel.2.28')); const z = await D.hebRef(V('Joel.2.32'));
  assert(a === '3.1' && z === '3.5', `${a} ${z}`);
  return `Hebrew ${a} to ${z}`;
});
test('Every BSB alignment tag is confirmed in its verse or marked unverified (Joel 2, Acts 2, Ps 51)', async () => {
  let ok = 0; let marked = 0;
  for (const [bk, c, n] of [['Joel', 2, 32], ['Acts', 2, 47], ['Ps', 51, 19]]) {
    for (let v = 1; v <= n; v++) {
      const id = V(`${bk}.${c}.${v}`);
      const t = await D.text(id); const o = await D.orig(id);
      if (!t || !t.bsb || !o) continue;
      const nums = new Set();
      for (const w of o.w) for (const m of `${w[3]} ${w[4] || ''} ${R.isNT(id) ? w[12] || '' : w[9] || ''}`.matchAll(/([HG])0*(\d+)/g)) nums.add(`${m[1]}${+m[2]}`);
      for (const [, tag] of t.bsb) {
        if (!tag) continue;
        if (tag.startsWith('?')) { marked += 1; continue; }
        const pk = D.plainKey(tag);
        if (!nums.has(pk)) throw new Error(`${bk} ${c}:${v} tag ${tag} not in verse and not marked`);
        ok += 1;
      }
    }
  }
  return `${ok} confirmed, ${marked} marked unverified`;
});
test('Acts 2:17 links to Joel 2:28-32 as a direct quotation, scored from shared Septuagint wording', async () => {
  const links = await linksFor(V('Acts.2.17'), V('Acts.2.17'), { lemmaLinks: false });
  const l = links.find((x) => x.b0 <= V('Joel.2.28') && x.b1 >= V('Joel.2.28'));
  assert(l, 'no link to Joel 2:28');
  assert(l.typ === 'q', `type ${l.typ}`);
  assert(l.quote && l.quote[0] >= 10 && /πνευματοσ/.test(l.quote[1]), JSON.stringify(l.quote));
  return `score ${l.score} (Q ${l.Q}, L ${l.L}, V ${l.V}, T ${l.T}); run of ${l.quote[0]} words`;
});
test('Link scores add up (Q+L+V+T+N) and every link type follows the published rules (900 links)', async () => {
  const df = await D.meta.df();
  let n = 0;
  for (const [bk, c] of [['Gen', 1], ['Ps', 22], ['Isa', 53], ['Joel', 2], ['Matt', 8], ['Acts', 2], ['Rom', 8], ['Heb', 1], ['Rev', 21]]) {
    const d = await D.getJSON(`xref/${bk}/${c}.json`);
    const keys = Object.keys(d.v);
    for (let i = 0; i < 100; i++) {
      const k = keys[(i * 37) % keys.length];
      const r = d.v[k][i % d.v[k].length];
      const [b0, , typ, score, Q, L, Vv, T, shared, , quote, typo, Nn] = r;
      const N = Nn || 0;
      assert(score === Q + L + Vv + T + N, `${bk} ${k}: ${score} != ${Q}+${L}+${Vv}+${T}+${N}`);
      const sb = R.bookIndex(bk);
      const cross = (sb >= R.NT_START) !== (R.parts(b0)[0] >= R.NT_START);
      // stored weights are rounded to 0.1, so a weight within 0.05 of a threshold may fall either side
      const ruleType = (keyMin, sumSlack) => {
        const keysW = (shared || []).filter((x) => x[1] >= keyMin).map((x) => x[1]);
        const sumKeys = keysW.reduce((a, b) => a + b, 0);
        const truncated = (shared || []).length === 6;
        const aByLemma = keysW.length >= 3 && (sumKeys >= 15 - sumSlack || truncated) && (Vv >= 10 || T);
        if (quote && quote[0] >= 4 && cross) return 'q';
        if ((quote && quote[0] === 3 && cross) || (N && cross) || aByLemma) return 'a';
        if (typo) return 't';
        if (keysW.length) return 'l';
        return 'e';
      };
      // each stored weight is rounded to 0.1, so a sum within 0.15 of a threshold may fall either side
      const strict = ruleType(3.55, 0); const lenient = ruleType(3.45, 0.6); const tight = ruleType(3.65, -0.16);
      if (typ !== strict && typ !== lenient && typ !== tight) throw new Error(`${bk} ${k} -> ${R.label(b0)}: type ${typ}, rules give ${strict}`);
      for (const [pk, w] of shared || []) {
        const ww = weightOf(pk, df);
        assert(Math.abs(ww - w) < 0.11, `${pk}: stored weight ${w}, recomputed ${ww.toFixed(2)}`);
      }
      n += 1;
    }
  }
  return `${n} links checked`;
});
test('Tier rule: a claim with only a Tier 3 text gets a plain-words warning', async () => {
  const res = await runClaim('zzzz qqqq xxxx', { pins: [{ tier: 3, label: '1QS 4:21', as: 'support' }] });
  assert(res.supporting.length === 0, 'unexpected support');
  assert(res.warnings.some((w) => /Only Tier 2 to 4 texts support this claim/.test(w)), res.warnings.join(' | '));
  return res.warnings[0];
});
test('The claim test never hands down a verdict', async () => {
  for (const c of ['God pours out his Spirit on all flesh', 'Tongues are the sign of Spirit baptism', 'Healing is in the atonement']) {
    const res = await runClaim(c);
    const text = [res.weight, ...res.warnings].join(' ');
    assert(!/\b(true|false|proven|disproven|correct|incorrect|wrong|right)\b/i.test(text), text);
  }
  return 'no verdict words in summaries or warnings';
});
test('Claim test finds Joel 2:28 or Acts 2:17 for "God pours out his Spirit on all flesh"', async () => {
  const res = await runClaim('God pours out his Spirit on all flesh');
  assert(where(res, V('Joel.2.28')) || where(res, V('Acts.2.17')), res.supporting.map((e) => R.rangeLabel(e.a, e.z)).join(', '));
  return res.weight;
});
test('Variant dependency: "signs will accompany those who believe" flags Mark 16:17', async () => {
  const res = await runClaim('signs will accompany those who believe', { pins: [{ tier: 1, v: V('Mark.16.17'), label: 'Mark 16:17', as: 'support' }] });
  const x = res.variants.find((y) => y.v === V('Mark.16.17'));
  assert(x, `variants: ${res.variants.map((y) => R.label(y.v)).join(', ')}`);
  return x.notes.map((n) => n.text).join(' ');
});
test('Variant dependency: John 5:4 is not in the Nestle-Aland text', async () => {
  const ai = await D.meta.ai();
  const notes = await variantCheck(V('John.5.4'), new Set(), ai);
  assert(notes.some((n) => /not count this verse as Nestle-Aland text|not in the Nestle-Aland/.test(n.text)), JSON.stringify(notes));
  return notes[0].text;
});
test('Scrolls: 4QDeut-j (4Q37) reads אלוהים at Deut 32:8 where the Masoretic Text has ישראל', async () => {
  const d = await D.dssBib(V('Deut.32.8'));
  const r = d.find((x) => x.s === '4Q37');
  assert(r && r.w.some((w) => w[0] === 'אלוהים' && w[1] === 'd'), JSON.stringify(r));
  return `${r.s} ${r.loc.join(', ')}`;
});
test('Scrolls: 1QIsa-a, 1QIsa-b and 4QIsa-d have אור ("light") at Isa 53:11', async () => {
  const d = await D.dssBib(V('Isa.53.11'));
  const have = d.filter((r) => r.w.some((w) => w[0] === 'אור' && w[1] !== 'r')).map((r) => r.s);
  assert(['1Qisaa', '1Q8', '4Q58'].every((s) => have.includes(s)), have.join(', '));
  return have.join(', ');
});
test('Scrolls: 4QSam-a carries the Nahash paragraph as text not in the Masoretic Text', async () => {
  const d = await D.dssBib(V('1Sam.10.27'));
  const r = d.find((x) => x.s === '4Q51');
  const plus = r ? r.w.filter((w) => w[1] === 'p').length : 0;
  assert(plus >= 20, `plus words ${plus}`);
  return `${plus} words not in the Masoretic Text`;
});
test('Scrolls: 11QPs-a has the nun line of Ps 145:13 as text not in the Masoretic Text', async () => {
  const d = await D.dssBib(V('Ps.145.13'));
  const r = d.find((x) => x.s === '11Q5');
  assert(r && r.w.some((w) => w[0] === 'נאמן' && w[1] === 'p'), JSON.stringify(r && r.w.slice(0, 20)));
  return 'נאמן אלוהים בדבריו found as a plus';
});
test('Scrolls: 4QJer-b runs 10:4, 10:9, 10:5, 10:11 and has no 10:6-8 or 10:10', async () => {
  const d = await D.getJSON('dss/bib/Jer.json');
  const have = Object.entries(d.v).filter(([, recs]) => recs.some((r) => r.s === '4Q71')).map(([k]) => k);
  for (const k of ['10:6', '10:7', '10:8', '10:10']) assert(!have.includes(k), `4Q71 has ${k}`);
  for (const k of ['10:4', '10:5', '10:9', '10:11']) assert(have.includes(k), `4Q71 lacks ${k}`);
  return `4Q71 verses: ${have.filter((k) => k.startsWith('10:')).join(', ')}`;
});
test('Hand-written notes exist for the five required variants, all labelled AI', async () => {
  const ai = await D.meta.ai();
  for (const k of ['Deut.32.8', '1Sam.10.27', 'Ps.145.13', 'Isa.53.11', 'Jer.10.5']) assert(ai.dss_notes[k], `missing ${k}`);
  assert(ai._label === 'AI-generated', 'AI file not labelled');
  return Object.keys(ai.dss_notes).join(', ');
});
test('STEPBible "X" words (from the Septuagint) are marked and not counted as Masoretic occurrences', async () => {
  const o = await D.orig(V('Ps.145.13'));
  const x = o.w.filter((w) => /^X/.test(w[6]));
  assert(x.length >= 5, `X words ${x.length}`);
  const root = x[0][3];
  const occ = await D.occurrences(root);
  assert(!occ.some((y) => y.v === V('Ps.145.13')), `${root} occurrence list includes Ps 145:13`);
  return `${x.length} X words; ${root} occurrences exclude Ps 145:13`;
});
test('AI text renders inside a labelled, separately styled box', async () => {
  const b = aiBox('test');
  assert(b.classList.contains('ai') && b.dataset.ai === '1' && /AI-generated/.test(b.textContent), b.outerHTML);
  const ai = await D.meta.ai();
  assert(Object.values(ai.dss_translations).every((t) => t.lines.length), 'empty translation');
  return 'class "ai", label "AI-generated"';
});
test('No em dashes in app code, AI text, journeys, sources or the README', async () => {
  const files = ['index.html', 'selftest.html', 'sw.js', 'manifest.webmanifest', 'README.md', 'app/main.js', 'app/views.js', 'app/data.js', 'app/refs.js', 'app/ui.js',
    'app/trail.js', 'app/links.js', 'app/graph.js', 'app/claim.js', 'app/editions.js', 'app/selftest.js', 'app/styles.css', 'data/ai/ai.json', 'data/journeys/journeys.json', 'data/meta/sources.json', 'data/idx/typology.json'];
  const bad = [];
  for (const f of files) {
    const r = await fetch(f);
    if (!r.ok) { if (f !== 'README.md') bad.push(`${f} missing`); continue; }
    if ((await r.text()).includes(String.fromCharCode(0x2014))) bad.push(f);
  }
  assert(!bad.length, bad.join(', '));
  return `${files.length} files clean`;
});
test('Word thread data: רוּחַ (all STEPBible sense tags of H7307) and πνεῦμα (G4151) as its Septuagint equivalent', async () => {
  const keys = await D.lemmaKeysFor('H7307');
  const set = new Set();
  for (const k of keys) for (const o of await D.occurrences(k)) set.add(o.v);
  const occ = [...set];
  const eq = (await D.meta.lxxeq()).h2g.H7307;
  assert(occ.length > 330 && keys.includes('H7307G'), `${occ.length} verses over ${keys.join(', ')}`);
  assert(eq && eq[0][0] === 'G4151', JSON.stringify(eq));
  return `${occ.length} verses over ${keys.join(', ')}; top equivalent ${eq[0][0]} (${eq[0][1]} times)`;
});
test('Lexicons: BDB for H7307; Abbott-Smith and Thayer for G4151', async () => {
  const h = await D.lexEntry('H7307'); const g = await D.lexEntry('G4151');
  assert(h && h.bdb && /spirit/.test(h.bdb), 'BDB');
  assert(g && g.as && g.th, 'Greek lexicons');
  return 'all three present';
});
test('Early church: Justin, Dialogue with Trypho, quotes Joel 2:28', async () => {
  const refs = await D.anfRefs(V('Joel.2.28'));
  let found = null;
  for (const [vol, pid, off] of refs) { const p = await D.anfPara(vol, pid); if (p && /JUSTIN/.test(p[1]) && /Trypho/.test(p[2])) found = p[0].slice(Math.max(0, off - 120), off + 20); }
  assert(found, 'not found');
  return found;
});
test('Tier 3: Josephus, Antiquities 6.5.1 (Whiston) tells of Nahash and is reachable from the 4QSam-a note', async () => {
  const b = await D.getJSON('josephus/ant/6.json');
  const ch = b.chapters.find((c) => c[0] === 5);
  assert(ch && /Nahash/.test(ch[2][0][1]), 'Nahash not found in 6.5.1');
  const ai = await D.meta.ai();
  assert((ai.dss_notes['1Sam.10.27'].links || []).some((l) => l[1] === '#/josephus/6.5.1'), 'note has no Josephus link');
  return ch[2][0][1].slice(0, 90);
});
test('Acts 2:17 against the Septuagint: "in the last days" only in Acts, "after these things" only in the LXX', async () => {
  const a = (await D.orig(V('Acts.2.17'))).g.split(/\s+/);
  const b = (await D.lxx(V('Joel.2.28')))[0].split(/\s+/);
  const { onlyA, onlyB } = diffWords(a.map(D.normGreek), b.map(D.normGreek));
  const A = [...onlyA].map((i) => D.normGreek(a[i])); const B = [...onlyB].map((i) => D.normGreek(b[i]));
  assert(A.includes('εσχαταισ') && A.includes('ημεραισ'), A.join(' '));
  assert(B.includes('μετα') && B.includes('ταυτα'), B.join(' '));
  return `only Acts: ${A.join(' ')} | only LXX: ${B.join(' ')}`;
});
test('Sermon skeleton: GOD comes from the trail; ME, WE, YOU and WE are prompts only', async () => {
  const t = { name: 'Test', created: Date.now(), steps: [{ kind: 'passage', ref: 'Joel.2.28-Joel.2.29', text: 'Joel 2:28-29', note: 'my note' }] };
  const md = await toSermon(t);
  const heads = [...md.matchAll(/^## (\w+)/gm)].map((m) => m[1]);
  assert(heads.join(',') === 'ME,WE,GOD,YOU,WE', heads.join(','));
  const sections = md.split(/^## /m).slice(1);
  for (const s of sections) {
    const body = s.split('\n').slice(1).filter((l) => l.trim());
    if (s.startsWith('GOD')) { assert(/pour out My Spirit/.test(s) && /my note/.test(s), 'GOD section lacks trail content'); continue; }
    assert(body.every((l) => /^_.*_$/.test(l.trim())), `${s.split('\n')[0]} has content: ${body.join(' | ')}`);
  }
  return 'headings ME, WE, GOD, YOU, WE';
});
test('Backup and restore: trails with notes, pins, edition references and settings come back from the JSON file', async () => {
  const keys = ['threads.trails.v1', 'threads.pins.v1', 'threads.settings.v1', 'threads.edition.selftest'];
  const saved = Object.fromEntries(keys.map((k) => { try { return [k, localStorage.getItem(k)]; } catch { return [k, null]; } }));
  try {
    const T = await import('./trail.js');
    localStorage.setItem('threads.pins.v1', JSON.stringify({ 'test claim': { pins: [{ tier: 3, label: '1 Enoch 8:1', as: 'support' }], removed: [] } }));
    localStorage.setItem('threads.edition.selftest', 'Vermes p. 412');
    const t = T.create('Self-test trail'); T.record('passage', 'Joel.2.28', 'Joel 2:28'); T.annotate(t.id, 0, 'my note');
    const file = T.backup();
    T.remove(t.id); localStorage.removeItem('threads.pins.v1'); localStorage.removeItem('threads.edition.selftest');
    const r = T.restore(file);
    const back = T.get(t.id);
    assert(back && back.steps[0].note === 'my note', 'trail or note not restored');
    assert(JSON.parse(localStorage.getItem('threads.pins.v1'))['test claim'].pins[0].label === '1 Enoch 8:1', 'pins not restored');
    assert(localStorage.getItem('threads.edition.selftest') === 'Vermes p. 412', 'edition reference not restored');
    T.remove(t.id);
    return `${r.trailsAdded} trail and ${r.other} other items restored from a ${file.length}-character backup`;
  } finally {
    for (const [k, v] of Object.entries(saved)) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } }
  }
});
test('Sources: every dataset is pinned to a commit and carries a license and attribution', async () => {
  const s = await D.meta.sources();
  for (const x of s.sources) assert(/^[0-9a-f]{40}$/.test(x.commit) && x.license && x.attribution && x.license_url, x.id);
  return `${s.sources.length} datasets`;
});
test('Typology links come from a typology entry of Nave or Torrey', async () => {
  const ty = await D.meta.typology();
  let seen = 0;
  for (let c = 1; c <= 13; c++) {
    const d = await D.getJSON(`xref/Heb/${c}.json`);
    for (const recs of Object.values(d.v)) for (const r of recs) if (r[2] === 't') { assert(ty[r[11]] && /typ/i.test(ty[r[11]][1]), JSON.stringify(r)); seen += 1; }
  }
  assert(seen > 0, 'no typology links in Hebrews');
  return `${seen} typology links in Hebrews, all traced to an entry`;
});
test('Reader: every verse shown carries a citation, and the semantic domain says "no data"', async () => {
  const f = document.getElementById('app');
  const w = await loadFrame(f, 'index.html#/read/Joel.2.28-Joel.2.32', (doc) => doc.querySelectorAll('.verse').length >= 5);
  const verses = [...w.document.querySelectorAll('.verse')];
  const missing = verses.filter((v) => !v.querySelector('.cite'));
  assert(!missing.length, `${missing.length} verses without citation`);
  w.document.querySelector('.lit .w').click();
  await waitFor(() => /Semantic domain/.test(w.document.getElementById('sheet-body').textContent));
  assert(/no data/.test(w.document.getElementById('sheet-body').textContent), 'domain not "no data"');
  return `${verses.length} verses, each cited`;
});
test('Colour contrast meets WCAG AA (4.5:1) for text in both light and dark modes', async () => {
  const f = document.getElementById('app');
  await loadFrame(f, 'index.html#/', (doc) => doc.querySelector('h1'));
  const lum = (hex) => { const n = hex.trim().replace('#', ''); const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const pairs = [['--ink', '--bg'], ['--ink', '--panel'], ['--muted', '--bg'], ['--muted', '--panel'], ['--gold', '--bg'], ['--gold', '--panel'], ['--gold-ink', '--gold'],
    ['--t1', '--t1bg'], ['--t2', '--t2bg'], ['--t3', '--t3bg'], ['--t4', '--t4bg'], ['--panel', '--ai'], ['--ai', '--aibg'], ['--warn', '--bg'], ['--ink', '--raise'], ['--bar-ink', '--bar'], ['--bar-gold', '--bar']];
  const out = []; const bad = [];
  const root = f.contentDocument.documentElement;
  const before = root.getAttribute('data-theme');
  for (const theme of ['light', 'dark']) {
    root.setAttribute('data-theme', theme);
    const cs = f.contentWindow.getComputedStyle(root);
    let min = 99;
    for (const [a, b] of pairs) {
      const r = ratio(cs.getPropertyValue(a), cs.getPropertyValue(b));
      min = Math.min(min, r);
      if (r < 4.5) bad.push(`${theme} ${a} on ${b}: ${r.toFixed(2)}`);
    }
    out.push(`${theme}: lowest ${min.toFixed(1)}:1 over ${pairs.length} pairs`);
  }
  if (before) root.setAttribute('data-theme', before); else root.removeAttribute('data-theme');
  assert(!bad.length, bad.join('; '));
  return out.join('; ');
});
test('Constellation: drag moves the web, the buttons zoom, and every node has a 44px tap area', async () => {
  const f = document.getElementById('app');
  const w = await loadFrame(f, 'index.html#/web/Joel.2.28', (doc) => doc.querySelector('.graph-wrap svg .viewport'));
  const doc = w.document;
  const svg = doc.querySelector('.graph-wrap svg'); const vp = svg.querySelector('.viewport');
  const box = svg.getBoundingClientRect();
  const ev = (type, x, y) => svg.dispatchEvent(new w.PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
  ev('pointerdown', box.left + 50, box.top + 50); ev('pointermove', box.left + 90, box.top + 80); ev('pointerup', box.left + 90, box.top + 80);
  const afterDrag = vp.getAttribute('transform') || '';
  assert(/translate\((?!0,0\))/.test(afterDrag), `drag did not move the web: ${afterDrag}`);
  doc.querySelector('.graph-tools button[aria-label="Zoom in"]').click();
  const zoomed = vp.getAttribute('transform');
  assert(/scale\(1\.3/.test(zoomed), `zoom: ${zoomed}`);
  doc.querySelector('.graph-tools button[aria-label="Reset view"]').click();
  const scale = box.width / 780;
  const sizes = [...svg.querySelectorAll('g[role=button]')].map((g) => { const c = g.querySelector('circle'); return c ? +c.getAttribute('r') * 2 * scale : 0; });
  const small = sizes.filter((x) => x < 43.5).length;
  assert(!small, `${small} nodes have tap areas under 44px at ${Math.round(box.width)}px wide`);
  return `drag moved the web to ${afterDrag.replace(/(\d)\.\d+/g, '$1')}; zoom in gave ${zoomed.match(/scale\([^)]*\)/)[0]}; ${sizes.length} nodes, each with a tap area at least ${Math.floor(Math.min(...sizes))}px across on a ${Math.round(box.width)}px wide graph`;
});
test('Speed: Psalm 119 renders within 1 second once its data is cached', async () => {
  const f = document.getElementById('app');
  await D.getJSON('text/Ps.json'); await D.getJSON('orig/Ps.json');
  const w = await loadFrame(f, 'index.html#/read/Ps.119.1-Ps.119.8', (doc) => doc.querySelectorAll('.verse').length >= 8);
  const t0 = performance.now();
  w.location.hash = '#/read/Ps.119.9-Ps.119.24';
  await waitFor(() => w.document.querySelectorAll('.verse').length >= 16 && w.document.querySelector('h1').textContent.includes('119:9'));
  const ms = performance.now() - t0;
  assert(ms < 1000, `${ms.toFixed(0)} ms`);
  return `${ms.toFixed(0)} ms for 16 verses`;
});
test('Offline: a service worker controls the app and the app shell is stored', async () => {
  if (!('serviceWorker' in navigator)) throw new Error('no service worker support');
  const reg = await navigator.serviceWorker.getRegistration();
  assert(reg, 'not registered');
  const c = await caches.open((await caches.keys()).find((k) => k.startsWith('threads-shell-')) || 'threads-shell-v2');
  assert(await c.match('index.html'), 'index.html not stored');
  return 'shell cached';
});

function waitFor(cond, ms = 15000) {
  return new Promise((res, rej) => {
    const t0 = performance.now();
    const tick = () => { try { if (cond()) return res(); } catch { /* not ready */ } if (performance.now() - t0 > ms) return rej(new Error('timed out')); setTimeout(tick, 30); };
    tick();
  });
}
async function loadFrame(f, src, ready) {
  if (!f.src.endsWith(src)) f.src = src;
  await waitFor(() => f.contentDocument && f.contentDocument.readyState === 'complete' && ready(f.contentDocument), 20000);
  return f.contentWindow;
}

async function main() {
  const rows = document.getElementById('rows');
  const results = [];
  let i = 0;
  let lastGroup = '';
  const only = new URLSearchParams(location.search).get('only');
  for (const t of tests.filter((x) => !only || x.name.toLowerCase().includes(only.toLowerCase()))) {
    i += 1;
    if (t.group !== lastGroup) { lastGroup = t.group; const g = document.createElement('tr'); g.innerHTML = `<th colspan="4" class="group">${t.group}</th>`; rows.append(g); }
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i}</td><td>${t.name}</td><td>running</td><td></td>`;
    rows.append(tr);
    try {
      const detail = await t.fn();
      results.push({ name: t.name, pass: true, detail, group: t.group });
      tr.children[2].innerHTML = '<span class="pass">PASS</span>';
      tr.children[3].textContent = detail || '';
    } catch (e) {
      results.push({ name: t.name, pass: false, detail: String(e.message || e), group: t.group });
      tr.children[2].innerHTML = '<span class="fail">FAIL</span>';
      tr.children[3].textContent = String(e.message || e);
    }
  }
  const passed = results.filter((r) => r.pass).length;
  const acc = results.filter((r) => r.group.startsWith('Acceptance'));
  document.getElementById('summary').textContent = `Acceptance tests: ${acc.filter((r) => r.pass).length} of ${acc.length} passed. All checks: ${passed} of ${results.length} passed.`;
  window.__selftest = { done: true, passed, failed: results.length - passed, results };
}
main();
