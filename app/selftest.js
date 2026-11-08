// Self-test: each check reads the same data and code the app uses.
import * as D from './data.js';
import * as R from './refs.js';
import { runClaim, variantCheck } from './claim.js';
import { diffWords } from './views.js';
import { linksFor, weightOf } from './links.js';
import { toSermon } from './trail.js';
import { ai as aiBox } from './ui.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const V = (osis) => R.parseOsis(osis);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

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
test('Link scores add up (Q+L+V+T) and every link type follows the published rules (900 links)', async () => {
  const df = await D.meta.df();
  let n = 0;
  for (const bk of ['Gen', 'Ps', 'Isa', 'Joel', 'Matt', 'Acts', 'Rom', 'Heb', 'Rev']) {
    const d = await D.getJSON(`xref/${bk}.json`);
    const keys = Object.keys(d.v);
    for (let i = 0; i < 100; i++) {
      const k = keys[(i * 37) % keys.length];
      const r = d.v[k][i % d.v[k].length];
      const [b0, , typ, score, Q, L, Vv, T, shared, , quote, typo] = r;
      assert(score === Q + L + Vv + T, `${bk} ${k}: ${score} != ${Q}+${L}+${Vv}+${T}`);
      const sb = R.bookIndex(bk);
      const cross = (sb >= R.NT_START) !== (R.parts(b0)[0] >= R.NT_START);
      // stored weights are rounded to 0.1, so a weight within 0.05 of a threshold may fall either side
      const ruleType = (keyMin, sumSlack) => {
        const keysW = (shared || []).filter((x) => x[1] >= keyMin).map((x) => x[1]);
        const sumKeys = keysW.reduce((a, b) => a + b, 0);
        const truncated = (shared || []).length === 6;
        const aByLemma = keysW.length >= 3 && (sumKeys >= 15 - sumSlack || truncated) && (Vv >= 10 || T);
        if (quote && quote[0] >= 4 && cross) return 'q';
        if ((quote && quote[0] === 3 && cross) || aByLemma) return 'a';
        if (typo) return 't';
        if (keysW.length) return 'l';
        return 'e';
      };
      const strict = ruleType(3.55, 0); const lenient = ruleType(3.45, 0.6);
      if (typ !== strict && typ !== lenient) throw new Error(`${bk} ${k} -> ${R.label(b0)}: type ${typ}, rules give ${strict}`);
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
  const ids = res.supporting.map((e) => e.v);
  assert(ids.includes(V('Joel.2.28')) || ids.includes(V('Acts.2.17')), ids.map(R.label).join(', '));
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
  assert(notes.some((n) => /not in the Nestle-Aland/.test(n.text)), JSON.stringify(notes));
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
    'app/trail.js', 'app/links.js', 'app/graph.js', 'app/claim.js', 'app/selftest.js', 'app/styles.css', 'data/ai/ai.json', 'data/journeys/journeys.json', 'data/meta/sources.json'];
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
test('Sources: every dataset is pinned to a commit and carries a license and attribution', async () => {
  const s = await D.meta.sources();
  for (const x of s.sources) assert(/^[0-9a-f]{40}$/.test(x.commit) && x.license && x.attribution && x.license_url, x.id);
  return `${s.sources.length} datasets`;
});
test('Typology links come from a typology entry of Nave or Torrey', async () => {
  const ty = await D.meta.typology();
  const d = await D.getJSON('xref/Heb.json');
  let seen = 0;
  for (const recs of Object.values(d.v)) for (const r of recs) if (r[2] === 't') { assert(ty[r[11]] && /typ/i.test(ty[r[11]][1]), JSON.stringify(r)); seen += 1; }
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
  const c = await caches.open('threads-shell-v1');
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
  for (const t of tests) {
    i += 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i}</td><td>${t.name}</td><td>running</td><td></td>`;
    rows.append(tr);
    try {
      const detail = await t.fn();
      results.push({ name: t.name, pass: true, detail });
      tr.children[2].innerHTML = '<span class="pass">PASS</span>';
      tr.children[3].textContent = detail || '';
    } catch (e) {
      results.push({ name: t.name, pass: false, detail: String(e.message || e) });
      tr.children[2].innerHTML = '<span class="fail">FAIL</span>';
      tr.children[3].textContent = String(e.message || e);
    }
  }
  const passed = results.filter((r) => r.pass).length;
  document.getElementById('summary').textContent = `${passed} of ${results.length} checks passed`;
  window.__selftest = { done: true, passed, failed: results.length - passed, results };
}
main();
