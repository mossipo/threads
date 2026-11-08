// All screens. Each render function fills the main view and records the step in the trail.
import { h, tier, ai, cite, nodata, openSheet, setSheetBody, toast, loading, TYPE_NAMES, TYPE_HELP, legend } from './ui.js';
import * as D from './data.js';
import * as R from './refs.js';
import * as Trail from './trail.js';
import { linksFor, explain, summary as linkSummary, aiReason } from './links.js';
import { drawConstellation } from './graph.js';
import { runClaim } from './claim.js';

const view = () => document.getElementById('view');
const SETTINGS_KEY = 'threads.settings.v1';
export const settings = (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })();
export function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } }
const SRC = { bsb: 'bsb', web: 'openbibles', kjv: 'openbibles', heb: 'stepbible', grk: 'stepbible', sbl: 'sblgnt', lxx: 'lxx', dss: 'dss', anf: 'anf' };

function setView(...kids) { const v = view(); v.replaceChildren(...kids); v.focus({ preventScroll: true }); window.scrollTo(0, 0); }
const refLink = (a, z, txt) => h('a', { href: `#/read/${R.rangeOsis(a, z || a)}` }, txt || R.rangeLabel(a, z || a));
const isHebWord = (v) => R.parts(v)[0] < R.NT_START;
function hebLabel(v, hr) { const [b] = R.parts(v); return hr ? `${R.bookName(b)} ${hr.replace('.', ':')}` : R.label(v); }

// --------------------------------------------------------------------- verse block
async function verseBlock(v, opts = {}) {
  const [t, o, hr] = await Promise.all([D.text(v), D.orig(v), D.hebRef(v)]);
  const heb = isHebWord(v);
  const box = h('div', { class: `verse${opts.ctx ? ' ctx' : ''}`, id: `v${v}`, 'data-v': v });
  const [, , vn] = R.parts(v);
  const bsbLine = h('div', { class: 'bsb' }, h('span', { class: 'vn' }, vn));
  if (t && t.bsb) {
    t.bsb.forEach((seg, i) => {
      if (!seg[1]) { bsbLine.append(seg[0]); return; }
      const unv = seg[1].startsWith('?');
      const sp = h('span', { class: `seg${unv ? ' unv' : ''}`, tabindex: 0, role: 'button', title: unv ? `Alignment tag ${seg[1].slice(1)} not found in this verse` : seg[1] }, seg[0]);
      const open = () => { box.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); sp.classList.add('sel'); bsbWordSheet(v, seg, o, hr); };
      sp.addEventListener('click', open);
      sp.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      bsbLine.append(sp);
    });
  } else {
    bsbLine.append(h('span', { class: 'nodata' }, 'No BSB text at this verse number (the BSB omits it; see the WEB or KJV below).'));
  }
  box.append(bsbLine);
  const showAlt = settings.web || settings.kjv || !(t && t.bsb);
  if (t && (settings.web || !(t && t.bsb)) && t.web) box.append(h('div', { class: 'alt' }, h('b', null, 'WEB'), t.web));
  if (t && (settings.kjv || !(t && t.bsb)) && t.kjv) box.append(h('div', { class: 'alt' }, h('b', null, 'KJV'), t.kjv));
  // literal line: English glosses of each Hebrew or Greek word, original one tap away
  if (o && o.w.length) {
    const lit = h('div', { class: `lit${heb ? ' heb' : ''}` });
    o.w.forEach((w, i) => {
      const cls = ['w'];
      if (heb && /^[XR]/.test(w[6])) cls.push('xw');
      else if (heb && w[6] !== 'L') cls.push('var');
      if (!heb && !/N/.test(w[6])) cls.push(/K/.test(w[6]) ? 'var' : 'var minor');
      const chip = h('span', { class: cls.join(' '), tabindex: 0, role: 'button', title: `${w[3]} ${w[5]}` },
        h('span', { class: `o ${heb ? 'heb' : 'grk'}` }, w[0]),
        h('span', { class: 'g' }, (w[2] || '').replace(/\//g, '').replace(/\s+/g, ' ').trim() || '·'));
      const open = () => { box.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); chip.classList.add('sel'); wordSheet(v, w, i, hr); };
      chip.addEventListener('click', open);
      chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      lit.append(chip);
    });
    box.append(lit);
    if (settings.orig) box.classList.add('show-orig');
    if (!heb && o.g && settings.orig) box.append(h('div', { class: 'grk-text' }, o.g));
  } else if (o && o.g) {
    box.append(h('div', { class: 'alt' }, 'No STEPBible word data at this verse number. SBLGNT: ', h('span', { class: 'grk-text' }, o.g)));
  }
  // witnesses and tools
  const tools = h('div', { class: 'vtools' });
  tools.append(h('button', { class: 'chip', onclick: () => box.classList.toggle('show-orig') }, heb ? 'Hebrew' : 'Greek'));
  if (heb) {
    const lx = await D.lxx(v);
    if (lx) tools.append(h('button', { class: 'chip', onclick: () => lxxSheet(v, lx) }, tier(2, true), 'LXX'));
    const dss = await D.dssBib(v);
    if (dss.length) tools.append(h('button', { class: 'chip', onclick: () => dssSheet(v, dss) }, tier(2, true), `Scrolls ${dss.length}`));
  }
  const anf = await D.anfRefs(v);
  if (anf.length) tools.append(h('button', { class: 'chip', onclick: () => anfSheet(v, anf) }, tier(4, true), `Fathers ${anf.length}`));
  tools.append(h('a', { class: 'chip', href: `#/web/${R.osisOf(v)}` }, 'Web'));
  box.append(tools);
  // citations
  const c = [`BSB ${R.label(v)}`];
  if (o && o.w.length) c.push(heb ? `Hebrew: Westminster Leningrad Codex with OSHB morphology, via STEPBible TAHOT, ${hebLabel(v, hr)}${hr ? ` (English ${R.label(v).split(' ').pop()})` : ''}` : `Greek words: STEPBible TAGNT, ${R.label(v)}; text: SBLGNT`);
  box.append(cite(c.join(' · '), heb ? ['bsb', 'stepbible', 'oshb'] : ['bsb', 'stepbible', 'sblgnt']));
  return box;
}

async function wordDetails(v, w, i, hr) {
  const heb = isHebWord(v);
  const morph = await D.meta.morph();
  const b = await D.brief(w[3]);
  const gram = w[5].split('/').map((g, k) => morph[g] || morph[`H${g}`] || g).join(' + ');
  const body = [
    h('div', { class: heb ? 'heb-text' : 'grk-text' }, w[0]),
    h('div', null, h('i', null, w[1]), ' · ', h('b', null, (w[2] || '').replace(/\//g, ' '))),
    h('div', { class: 'small muted' }, `${w[5]}: ${gram}`),
  ];
  if (heb) {
    const tt = { L: 'Leningrad Codex text', Q: 'Masoretic marginal reading (Qere) followed', K: 'written text (Ketiv)', R: 'Restored from a parallel passage; not in the Leningrad Codex', X: 'Hebrew reconstructed from the Septuagint (BHS or BHK apparatus); not in the Leningrad Codex' };
    body.push(h('div', { class: 'small' }, `Text type ${w[6]}: ${tt[w[6][0]] || 'see STEPBible abbreviations'}`));
    if (/^X/.test(w[6])) body.push(h('div', { class: 'warnbox small' }, tier(2), 'This word is Tier 2 evidence shown inside the Hebrew line. It is not part of the Masoretic Text.'));
    if (w[7]) body.push(h('div', { class: 'small' }, `Variants: ${w[7]}`));
    if (w[8]) body.push(h('div', { class: 'small' }, `Spelling: ${w[8]}`));
  } else {
    const names = ['NA28', 'NA27', 'Tyndale House', 'SBLGNT', 'Westcott-Hort', 'Tregelles', 'Textus Receptus', 'Byzantine'];
    const eds = names.filter((_, k) => (w[9] || 0) & (1 << k));
    body.push(h('div', { class: 'small' }, `Word type ${w[6]}. In: ${eds.join(', ') || 'other editions only'}${w[10] ? ` (${w[10]})` : ''}`));
    if (!/N/.test(w[6])) body.push(h('div', { class: 'warnbox small' }, 'Not in the Nestle-Aland text. A claim resting on this word has a variant dependency.'));
    if (w[11] && w[11].trim() !== '^') body.push(h('div', { class: 'small' }, `Variant note: ${w[11].replace(/^\^\s*/, '')}`));
    if (w[7]) body.push(h('div', { class: 'small' }, `Meaning variants: ${w[7]}`));
  }
  if (b) {
    body.push(h('h3', null, 'Lemma'), h('div', null, h('span', { class: heb ? 'heb-text' : 'grk-text' }, b.l), ` ${b.t} · ${b.g}`));
    body.push(h('div', { class: 'small muted' }, `Semantic domain: `, nodata('no data (the UBS domain data is not openly licensed; see About)')));
  }
  body.push(h('div', { class: 'row' }, h('a', { class: 'btn primary', href: `#/word/${w[3]}?v=${R.osisOf(v)}` }, 'Word thread')));
  body.push(cite(heb ? `STEPBible TAHOT, ${hebLabel(v, hr)}, word ${i + 1}; lexicon: STEPBible TBESH ${w[3]}` : `STEPBible TAGNT, ${R.label(v)}, word ${i + 1}; lexicon: STEPBible TBESG ${w[3]}`, ['stepbible']));
  return body;
}
async function wordSheet(v, w, i, hr) {
  openSheet((w[2] || w[0]).replace(/\//g, ' '), loading());
  setSheetBody(await wordDetails(v, w, i, hr));
}
async function bsbWordSheet(v, seg, o, hr) {
  const tag = seg[1].replace(/^\?/, '');
  const pk = D.plainKey(tag);
  openSheet(seg[0].trim(), loading());
  const body = [h('p', null, h('b', null, seg[0].trim()), ` · BSB alignment tag ${tag}`)];
  const idx = o ? o.w.findIndex((w) => D.plainKey(w[3]) === pk || (w[4] || '').includes(pk.slice(1).padStart(4, '0'))) : -1;
  if (seg[1].startsWith('?') || idx < 0) {
    body.push(h('div', { class: 'warnbox small' }, `The BSB alignment names ${tag}, but no word with that number is in the ${isHebWord(v) ? 'Hebrew' : 'Greek'} of this verse (STEPBible). The two often number the same word differently. Check the literal line below the verse.`));
    const b = await D.brief(tag);
    if (b) body.push(h('div', null, h('span', { class: isHebWord(v) ? 'heb-text' : 'grk-text' }, b.l), ` ${b.t} · ${b.g}`), h('a', { class: 'btn', href: `#/word/${tag}?v=${R.osisOf(v)}` }, `Word thread for ${tag}`));
    body.push(cite(`BSB interlinear alignment, ${R.label(v)}`, ['bsb']));
    setSheetBody(body);
    return;
  }
  setSheetBody([...body, ...(await wordDetails(v, o.w[idx], idx, hr)), cite(`BSB interlinear alignment, ${R.label(v)}`, ['bsb'])]);
}

// --------------------------------------------------------------------- witness sheets
function lxxSheet(v, lx) {
  openSheet(`Septuagint, ${R.label(v)}`, [
    h('p', null, tier(2), 'Textual witness: what the Greek translators read.'),
    h('div', { class: 'card box-t2' }, h('div', { class: 'grk-text' }, lx[0]), h('p', null, lx[1]),
      cite(`Swete, ${R.label(v)}${lx[2] ? ` (Swete numbering ${lx[2]})` : ''}; Brenton's English`, ['lxx'])),
  ]);
}
async function dssSheet(v, recs) {
  const ai = await D.meta.ai();
  const note = ai.dss_notes[R.osisOf(v)];
  const o = await D.orig(v);
  const body = [h('p', null, tier(2), 'Biblical scrolls compared word by word with the Masoretic Text (letters only).'), dssLegend()];
  if (note) body.push(dssNote(note, ai));
  for (const r of recs) body.push(dssWitness(v, r, o));
  body.push(cite(`ETCBC/dss (Abegg), ${R.label(v)}; comparison by the Threads build. Non-commercial license.`, ['dss']));
  openSheet(`Dead Sea Scrolls, ${R.label(v)}`, body);
}
function dssLegend() {
  return h('div', { class: 'legend-row' }, ...[['s', 'same'], ['o', 'spelling only'], ['c', 'adds or lacks "and"'], ['d', 'different word'], ['p', 'not in the Masoretic Text'], ['r', 'reconstructed by the editor']]
    .map(([k, t]) => h('span', null, h('span', { class: `sw ${k}` }, 'אבג'), t)));
}
function dssNote(note, aiData) {
  const box = ai([h('p', null, h('b', null, note.title)), ...note.body.map((p) => h('p', null, p)), h('p', { class: 'small' }, note.editions)], aiData._by);
  for (const [t, href] of note.links || []) box.append(h('p', null, h('a', { class: 'btn small', href }, t)));
  return box;
}
function leonLevy(scroll) {
  const imj = { '1Qisaa': 'isaiah', '1QS': 'community', '1QM': 'war', '11Q19': 'temple', '1QpHab': 'commentary' };
  if (imj[scroll]) return h('a', { href: `https://dss.collections.imj.org.il/${imj[scroll]}`, target: '_blank', rel: 'noopener' }, 'Images (Israel Museum, online)');
  if (/^\d+Q/.test(scroll)) return h('a', { href: `https://www.deadseascrolls.org.il/explore-the-archive/manuscript/${encodeURIComponent(scroll)}-1`, target: '_blank', rel: 'noopener' }, 'Images (Leon Levy library, online)');
  return null;
}
function dssWitness(v, r, o) {
  const mtw = o ? o.w.filter((w) => !/^[XR]/.test(w[6])) : [];
  const line = h('div', { class: 'heb-text' });
  for (const w of r.w) line.append(h('span', { class: `sw ${w[1]}${w[4] ? ' part' : ''}`, title: w[1] === 'r' ? 'reconstructed' : '' }, w[0]), ' ');
  const diffs = [];
  for (const w of r.w) {
    if (w[1] === 'd') diffs.push(h('li', null, `Scroll ${w[0]} where the Masoretic Text has ${mtw[w[3]] ? `${mtw[w[3]][0]} ("${mtw[w[3]][2].replace(/\//g, '')}")` : 'another word'}${w[2] && w[2].length ? `; dictionary match: ${w[2].map((x) => x[1]).join(' or ')}` : ''}.`));
    if (w[1] === 'p') diffs.push(h('li', null, `Scroll adds ${w[0]}${w[2] && w[2].length ? ` (dictionary match: ${w[2].map((x) => x[1]).join(' or ')})` : ''}.`));
    if (w[1] === 'c') diffs.push(h('li', null, `Scroll ${w[0]}: same word with or without "and".`));
  }
  for (const [j, g] of r.m) diffs.push(h('li', null, `No scroll word for Masoretic ${mtw[j] ? mtw[j][0] : ''} ("${(g || '').replace(/\//g, '')}"): omitted or damaged.`));
  return h('div', { class: 'card box-t2' }, h('div', { class: 'row' }, h('b', null, r.s), h('span', { class: 'small muted' }, r.loc.join(', ')), leonLevy(r.s)),
    line, diffs.length ? h('ul', { class: 'small' }, diffs) : h('div', { class: 'small muted' }, 'No word differences in the preserved letters (spelling aside).'),
    h('div', { class: 'small muted' }, 'English for differing words comes from a dictionary-form match and may be imprecise.'));
}
async function anfSheet(v, refs) {
  openSheet(`Early church on ${R.label(v)}`, loading());
  const body = [h('p', null, tier(4), 'Reception: where the Ante-Nicene Fathers cite or echo this verse (references identified by the ANF editors).')];
  for (const [vol, pid, off] of refs.slice(0, 40)) {
    const p = await D.anfPara(vol, pid);
    if (!p) continue;
    const start = Math.max(0, off - 420);
    const snippet = (start > 0 ? '... ' : '') + p[0].slice(start, off + 160) + (off + 160 < p[0].length ? ' ...' : '');
    body.push(h('div', { class: 'card box-t4' }, h('div', null, h('b', null, p[1]), ', ', p[2], p[3] ? h('span', { class: 'small muted' }, ` · ${p[3]}`) : null),
      h('p', { class: 'small' }, snippet), cite(`Ante-Nicene Fathers vol. ${+vol}, CCEL section ${pid}`, ['anf'])));
  }
  if (refs.length > 40) body.push(h('p', { class: 'small muted' }, `${refs.length - 40} more not shown.`));
  setSheetBody(body);
}

// --------------------------------------------------------------------- reader
export async function renderReader(a, z) {
  setView(loading());
  const vs = await D.passageVerses(a, z);
  const [ca, cz] = await D.contextRange(a, z, 3);
  const head = h('div', null, h('h1', null, R.rangeLabel(a, z)));
  const hr1 = await D.hebRef(a); const hr2 = await D.hebRef(z);
  if (hr1 || hr2) head.append(h('p', { class: 'note-heb' }, `Hebrew numbering: ${(hr1 || R.keyOf(a)).replace('.', ':')}${a !== z ? ` to ${(hr2 || R.keyOf(z)).replace('.', ':')}` : ''}`));
  const toggles = h('div', { class: 'row' });
  for (const [k, t] of [['web', 'WEB'], ['kjv', 'KJV'], ['orig', R.isNT(a) ? 'Greek' : 'Hebrew']]) {
    toggles.append(h('button', { class: `chip${settings[k] ? ' on' : ''}`, onclick: () => { settings[k] = !settings[k]; saveSettings(); renderReader(a, z); } }, t));
  }
  toggles.append(h('a', { class: 'btn', href: `#/web/${R.rangeOsis(a, z)}` }, 'See the web'), h('a', { class: 'btn', href: `#/test?ref=${R.rangeOsis(a, z)}` }, 'Test a claim'));
  const list = h('div');
  const ctxBtn = h('button', { class: 'btn small', onclick: async () => {
    ctxBtn.remove();
    const before = await D.passageVerses(ca, a); before.pop();
    const after = await D.passageVerses(z, cz); after.shift();
    for (const v of before.reverse()) list.prepend(await verseBlock(v, { ctx: true }));
    for (const v of after) list.append(await verseBlock(v, { ctx: true }));
  } }, 'Show 3 verses of context on each side');
  setView(head, toggles, h('p', null, ctxBtn), list, nav(a, z));
  for (const v of vs) list.append(await verseBlock(v));
  Trail.record('passage', R.rangeOsis(a, z), R.rangeLabel(a, z));
}
function nav(a, z) {
  const [b, c] = R.parts(a);
  const prev = c > 1 ? `${R.bookOsis(b)}.${c - 1}.1` : null;
  const next = `${R.bookOsis(b)}.${R.parts(z)[1] + 1}.1`;
  return h('div', { class: 'row', style: 'margin-top:12px' },
    prev ? h('a', { class: 'btn', href: `#/read/${R.bookOsis(b)}.${c - 1}` }, 'Previous chapter') : null,
    h('a', { class: 'btn', href: `#/read/${R.bookOsis(b)}.${R.parts(z)[1] + 1}` }, 'Next chapter'));
}

// --------------------------------------------------------------------- constellation
export async function renderWeb(a, z) {
  setView(loading('Gathering links'));
  const links = await linksFor(a, z);
  const top = links.slice(0, 24);
  const nodes = top.map((l) => ({ ...l, label: R.rangeLabel(l.b0, l.b1), short: shortRef(l.b0, l.b1) }));
  const witnesses = await witnessNodes(a, z);
  const graph = h('div', { class: 'graph-wrap' });
  const leg = h('details', { class: 'card' }, h('summary', null, 'Legend'), legend());
  const listEl = h('div');
  setView(
    h('h1', null, `Web: ${R.rangeLabel(a, z)}`),
    h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/read/${R.rangeOsis(a, z)}` }, 'Read'), h('a', { class: 'btn', href: `#/test?ref=${R.rangeOsis(a, z)}` }, 'Test a claim')),
    h('p', { class: 'small muted' }, `Showing the ${nodes.length} strongest of ${links.length} links. Tap a line to see how it was scored, or a node to read it in context.`),
    graph, leg, h('h2', null, 'All links'), listEl);
  drawConstellation(graph, { label: R.rangeLabel(a, z) }, nodes, witnesses, {
    node: (n) => nodeSheet(n, a, z),
    edge: (n) => edgeSheet(n),
    witness: (w) => w.open(),
  });
  for (const l of links.slice(0, 120)) {
    listEl.append(h('div', { class: 'result' }, h('span', { class: `type-pill ${l.typ}` }, TYPE_NAMES[l.typ]), ' ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); edgeSheet({ ...l, label: R.rangeLabel(l.b0, l.b1) }); } }, R.rangeLabel(l.b0, l.b1)),
      h('span', { class: 'strength' }, ` score ${l.score}`)));
  }
  if (links.length > 120) listEl.append(h('p', { class: 'small muted' }, `${links.length - 120} weaker links not listed.`));
  Trail.record('web', R.rangeOsis(a, z), `Web of ${R.rangeLabel(a, z)}`);
}
function shortRef(b0, b1) {
  const [b, c, v] = R.parts(b0);
  const name = R.BOOKS[b - 1][0];
  const [, c2, v2] = R.parts(b1);
  return b0 === b1 ? `${name} ${c}:${v}` : c === c2 ? `${name} ${c}:${v}-${v2}` : `${name} ${c}:${v}-${c2}:${v2}`;
}
async function witnessNodes(a, z) {
  const vs = (await D.passageVerses(a, z)).slice(0, 40);
  const out = [];
  if (!R.isNT(a)) {
    let lxxCount = 0; const scrolls = new Map();
    for (const v of vs) {
      if (await D.lxx(v)) lxxCount += 1;
      for (const r of await D.dssBib(v)) { if (!scrolls.has(r.s)) scrolls.set(r.s, []); scrolls.get(r.s).push(v); }
    }
    if (lxxCount) out.push({ tier: 2, short: 'LXX', label: 'Septuagint', open: () => lxxPassageSheet(vs) });
    for (const [s, list] of [...scrolls.entries()].slice(0, 7)) out.push({ tier: 2, short: s, label: `Scroll ${s}`, open: async () => dssSheet(list[0], await D.dssBib(list[0])) });
  }
  const works = new Map();
  for (const v of vs) for (const [vol, pid] of await D.anfRefs(v)) {
    const p = await D.anfPara(vol, pid);
    if (!p) continue;
    const k = p[1];
    if (!works.has(k)) works.set(k, v);
  }
  for (const [author, v] of [...works.entries()].slice(0, 7)) out.push({ tier: 4, short: author.replace(/\.$/, '').slice(0, 16), label: author, open: async () => anfSheet(v, await D.anfRefs(v)) });
  return out;
}
async function lxxPassageSheet(vs) {
  const body = [h('p', null, tier(2), 'Textual witness: the Septuagint (Swete) with Brenton\'s English.')];
  for (const v of vs) {
    const lx = await D.lxx(v);
    if (!lx) continue;
    body.push(h('div', { class: 'card box-t2' }, h('b', null, R.label(v)), h('div', { class: 'grk-text' }, lx[0]), h('div', null, lx[1]), cite(`Swete, ${R.label(v)}${lx[2] ? ` (Swete ${lx[2]})` : ''}; Brenton`, ['lxx'])));
  }
  openSheet('Septuagint', body);
}
async function nodeSheet(n, a, z) {
  openSheet(n.label, loading());
  const [ca, cz] = await D.contextRange(n.b0, n.b1, 3);
  const vs = await D.passageVerses(ca, cz);
  const body = [h('div', { class: 'row' },
    h('a', { class: 'btn primary', href: `#/web/${R.rangeOsis(n.b0, n.b1)}` }, 'Make this the centre'),
    h('a', { class: 'btn', href: `#/read/${R.rangeOsis(n.b0, n.b1)}` }, 'Read'),
    h('button', { class: 'btn', onclick: () => { Trail.record('link', `${R.osisOf(n.from)}|${R.rangeOsis(n.b0, n.b1)}`, `${R.label(n.from)} to ${n.label}`, { summary: linkSummary(n) }); toast('Added to your trail'); } }, 'Add to trail'))];
  for (const v of vs) {
    const tx = await D.bsbText(v);
    const inLink = v >= n.b0 && v <= n.b1;
    body.push(h('div', { class: `verse${inLink ? '' : ' ctx'}` }, h('span', { class: 'vn' }, R.parts(v)[2]), tx || h('span', { class: 'nodata' }, 'no BSB text')));
  }
  body.push(cite(`BSB ${R.rangeLabel(ca, cz)} (3 verses of context on each side)`, ['bsb']));
  setSheetBody(body);
}
async function edgeSheet(n) {
  openSheet(`${R.label(n.from)} to ${n.label || R.rangeLabel(n.b0, n.b1)}`, loading());
  const rows = await explain(n);
  const table = h('table', { class: 'score-table' });
  for (const [k, pts, why] of rows) table.append(h('tr', null, h('td', null, h('b', null, k), h('div', { class: 'small muted' }, why)), h('td', null, pts === '' ? '' : String(pts))));
  table.append(h('tr', null, h('td', null, h('b', null, 'Score = Q + L + V + T')), h('td', null, h('b', null, String(n.score)))));
  const body = [h('p', null, h('span', { class: `type-pill ${n.typ}` }, TYPE_NAMES[n.typ]), ' ', h('span', { class: 'small' }, TYPE_HELP[n.typ])), table];
  if (n.typo) {
    const ty = await D.meta.typology();
    const e = ty[n.typo];
    if (e) body.push(h('p', { class: 'small' }, `Typology entry: ${e[0]}: "${e[1]}"`, cite(`${n.typo.startsWith('nave') ? "Nave's Topical Bible" : "Torrey's New Topical Textbook"}, ${e[0]}`, ['topical'])));
  }
  const reason = await aiReason(n);
  const aiData = await D.meta.ai();
  body.push(reason ? ai(reason, 'Link reason. Not used in the score.') : h('p', { class: 'small muted' }, 'No AI link reason has been written for this link. The score above is complete without one.'));
  for (const [x, y] of [[n.from, n.from], [n.b0, Math.min(n.b1, n.b0 + 6)]]) {
    const vs = await D.passageVerses(x, y);
    const texts = [];
    for (const v of vs) texts.push(await D.bsbText(v));
    body.push(h('div', { class: 'card box-t1' }, h('b', null, R.rangeLabel(x, y)), h('p', null, texts.join(' ')), cite(`BSB ${R.rangeLabel(x, y)}`, ['bsb'])));
  }
  body.push(h('div', { class: 'row' },
    h('button', { class: 'btn', onclick: () => { Trail.record('link', `${R.osisOf(n.from)}|${R.rangeOsis(n.b0, n.b1)}`, `${R.label(n.from)} to ${R.rangeLabel(n.b0, n.b1)}`, { summary: linkSummary(n) }); toast('Added to your trail'); } }, 'Add to trail'),
    h('a', { class: 'btn', href: `#/web/${R.rangeOsis(n.b0, n.b1)}` }, 'Make the other end the centre')));
  body.push(cite(`Scores from: OpenBible.info votes, TSK (CrossWire), STEPBible lemmas, MACULA Hebrew Septuagint equivalents, SBLGNT and Swete wording. ${aiData ? '' : ''}`, ['openbible', 'tsk', 'stepbible', 'macula_hebrew', 'sblgnt', 'lxx']));
  setSheetBody(body);
}

// --------------------------------------------------------------------- word thread
export async function renderWord(dkey, ctx) {
  setView(loading());
  const pk = D.plainKey(dkey);
  const heb = pk[0] === 'H';
  const [entry, b] = await Promise.all([D.lexEntry(dkey), D.brief(dkey)]);
  const keys = await D.lemmaKeysFor(pk);
  const allKeys = keys.length ? keys : [dkey];
  const exact = allKeys.find((k) => D.plainKey(k) === pk && k.replace(/^([HG])0*/, '$1') === dkey.replace(/^([HG])0*/, '$1')) || allKeys[0];
  let occ = await D.occurrences(exact);
  const head = h('div', null,
    h('h1', null, h('span', { class: heb ? 'heb-text' : 'grk-text' }, b ? b.l : dkey), ' ', b ? h('span', { class: 'muted' }, b.t) : null),
    h('p', null, h('b', null, b ? b.g : ''), ` · ${dkey}`, b && b.m ? ` · ${b.m}` : ''),
    h('p', { class: 'small' }, 'Semantic domain: ', nodata('no data (UBS semantic domains are not openly licensed; see About)')));
  // lexicons
  const lexBox = h('div', { class: 'card lex' });
  const tabs = h('div', { class: 'chips' });
  const lexes = [];
  if (b) lexes.push(['STEPBible brief', `<p><b>${b.l}</b> ${b.t}: ${b.g}</p>${b.x}`, 'stepbible']);
  if (entry && entry.bdb) lexes.push(['Brown-Driver-Briggs', entry.bdb, 'bdb']);
  if (entry && entry.as) lexes.push(['Abbott-Smith', entry.as, 'abbott_smith']);
  if (entry && entry.th) lexes.push(['Thayer', entry.th, 'thayer']);
  const showLex = (i) => {
    tabs.querySelectorAll('.chip').forEach((c, k) => c.classList.toggle('on', k === i));
    lexBox.innerHTML = lexes[i][1];
    lexBox.append(cite(`${lexes[i][0]}, entry ${pk}`, [lexes[i][2]]));
    lexBox.querySelectorAll('a[data-ref]').forEach((a) => { const v = R.parseOsis(a.dataset.ref); if (v) a.href = `#/read/${R.osisOf(v)}`; });
  };
  lexes.forEach((l, i) => tabs.append(h('button', { class: 'chip', onclick: () => showLex(i) }, l[0])));
  // occurrences
  const occBox = h('div');
  const drawOcc = (list, label) => {
    const byBook = new Map();
    for (const o of list) { const bk = R.parts(o.v)[0]; byBook.set(bk, (byBook.get(bk) || []).concat(o)); }
    const total = list.reduce((s, o) => s + o.n, 0);
    const maxN = Math.max(1, ...[...byBook.values()].map((x) => x.reduce((s, o) => s + o.n, 0)));
    const bars = h('div', { class: 'bars', role: 'img', 'aria-label': 'Occurrences by book' });
    for (let bk = 1; bk <= 66; bk++) {
      const n = (byBook.get(bk) || []).reduce((s, o) => s + o.n, 0);
      if (!n) continue;
      bars.append(h('div', { class: bk >= R.NT_START ? 'nt' : '', style: `height:${Math.max(4, (n / maxN) * 100)}%`, title: `${R.bookName(bk)}: ${n}`,
        onclick: () => document.getElementById(`occ-${bk}`)?.setAttribute('open', '') }));
    }
    const lists = h('div');
    for (const [bk, items] of byBook) {
      lists.append(h('details', { class: 'occ-book', id: `occ-${bk}` }, h('summary', null, `${R.bookName(bk)} (${items.reduce((s, o) => s + o.n, 0)})`),
        ...items.map((o) => h('a', { href: `#/read/${R.osisOf(o.v)}` }, `${R.parts(o.v)[1]}:${R.parts(o.v)[2]}${o.n > 1 ? ` (x${o.n})` : ''}`))));
    }
    occBox.replaceChildren(h('p', null, h('b', null, `${total} occurrences`), ` in ${list.length} verses (${label})`), bars,
      h('div', { class: 'small muted' }, `Bars run Genesis to Revelation; ${heb ? 'Hebrew Old Testament (Masoretic words only)' : 'Greek New Testament (words in the NA text or the TR)'}.`), lists,
      cite(`STEPBible ${heb ? 'TAHOT' : 'TAGNT'} word tags (${label})`, ['stepbible']));
  };
  const senseChips = h('div', { class: 'chips' });
  if (allKeys.length > 1) {
    const all = h('button', { class: 'chip', onclick: async () => {
      let merged = [];
      for (const k of allKeys) merged = merged.concat(await D.occurrences(k));
      const m = new Map(); for (const o of merged) m.set(o.v, (m.get(o.v) || 0) + o.n);
      drawOcc([...m.entries()].sort((x, y) => x[0] - y[0]).map(([v, n]) => ({ v, n })), allKeys.join(', '));
    } }, `All tags for ${pk} (${allKeys.join(', ')})`);
    senseChips.append(h('button', { class: 'chip on', onclick: () => drawOcc(occ, exact) }, exact), all);
  }
  drawOcc(occ, exact);
  // Septuagint equivalents
  const eq = await D.meta.lxxeq();
  const eqList = (heb ? eq.h2g[pk] : eq.g2h[pk]) || [];
  const eqBox = h('div');
  if (!eqList.length) eqBox.append(nodata());
  for (const [k, n] of eqList.slice(0, 8)) {
    const bb = await D.brief(k);
    eqBox.append(h('div', null, h('a', { href: `#/word/${k}` }, bb ? bb.l : k), ` ${bb ? bb.g : ''} · ${k} · ${n} times`));
  }
  eqBox.append(cite(`MACULA Hebrew: Septuagint Greek equivalents of Hebrew words${heb ? '' : ' (read in reverse)'}`, ['macula_hebrew']));
  // Dead Sea Scrolls
  const dssBox = h('div');
  if (heb && b) {
    const d = await D.dssLex(D.hebConsonants(b.l));
    if (d) {
      dssBox.append(h('p', null, `${d[0]} occurrences of the letters ${D.hebConsonants(b.l)} as a lexeme: ${d[1]} in biblical scrolls, ${d[0] - d[1]} in other scrolls.`));
      const ul = h('div', { class: 'chips' });
      for (const loc of d[2].slice(0, 40)) { const [sc, fl] = loc.split(' '); ul.append(h('a', { class: 'chip', href: `#/scroll/${encodeURIComponent(sc)}?at=${fl}` }, loc)); }
      dssBox.append(ul, h('p', { class: 'small muted' }, 'Matched by consonants only: words spelled the same but from a different root are included.'));
    } else dssBox.append(nodata());
    dssBox.append(cite('ETCBC/dss (Abegg) lexemes. Non-commercial license.', ['dss']));
  } else dssBox.append(nodata(heb ? 'no data' : 'The scrolls are Hebrew and Aramaic; see the Hebrew equivalents above.'));
  setView(head, tabs, lexBox, h('h2', null, 'Every occurrence'), senseChips, occBox,
    h('h2', null, tier(2), heb ? 'Septuagint equivalents' : 'Hebrew words it renders in the Septuagint'), eqBox,
    h('h2', null, tier(2), 'In the Dead Sea Scrolls'), dssBox);
  if (lexes.length) showLex(0); else lexBox.append(nodata());
  Trail.record('word', dkey, `${b ? b.l : ''} ${dkey} (${b ? b.g : ''})`, { summary: `${b ? b.l : dkey} (${dkey}), "${b ? b.g : ''}": ${occ.reduce((s, o) => s + o.n, 0)} occurrences in ${occ.length} verses.` });
}

// --------------------------------------------------------------------- claim test
const PIN_KEY = 'threads.pins.v1';
function pinStore() { try { return JSON.parse(localStorage.getItem(PIN_KEY)) || {}; } catch { return {}; } }
function pinSave(s) { try { localStorage.setItem(PIN_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export async function renderTest(initial, refHint) {
  const input = h('textarea', { placeholder: 'Type a claim, e.g. "God pours out his Spirit on all flesh"', 'aria-label': 'Claim' }, initial || '');
  const out = h('div');
  const pinIn = h('input', { type: 'text', placeholder: 'Pin a text: Joel 2:28, LXX Joel 2:28, or 1QS 4:21' });
  const pinAs = h('select', null, h('option', { value: 'support' }, 'as support'), h('option', { value: 'tension' }, 'as tension'));
  const pinList = h('div', { class: 'chips' });
  const store = pinStore();
  const keyOf = () => input.value.trim().toLowerCase();
  const cur = () => store[keyOf()] || { pins: [], removed: [] };
  const drawPins = () => {
    const c = cur();
    pinList.replaceChildren(...c.pins.map((p, i) => h('span', { class: 'chip on' }, tier(p.tier, true), `${p.label} (${p.as})`, h('button', { class: 'icon-btn', 'aria-label': 'Unpin', onclick: () => { c.pins.splice(i, 1); store[keyOf()] = c; pinSave(store); drawPins(); } }, '✕'))),
      ...c.removed.map((v, i) => h('span', { class: 'chip' }, `removed ${R.label(v)}`, h('button', { class: 'icon-btn', 'aria-label': 'Restore', onclick: () => { c.removed.splice(i, 1); store[keyOf()] = c; pinSave(store); drawPins(); } }, '↺'))));
  };
  const addPin = async () => {
    const s = pinIn.value.trim();
    if (!s) return;
    const c = cur();
    const sm = /^(\d+Q\w*|CD|Mas\w*|Mur\w*|XHev\S*)\s+(\S+)$/i.exec(s);
    const lx = /^(LXX|Septuagint)\s+(.+)$/i.exec(s);
    if (sm) {
      // a biblical scroll is a Tier 2 witness; any other scroll is Tier 3 background
      const list = await D.meta.scrolls();
      const row = list.find((r) => r[0].toLowerCase() === sm[1].toLowerCase());
      const tierN = row && row[2] > row[1] * 0.5 ? 2 : 3;
      c.pins.push({ tier: tierN, label: s, as: pinAs.value });
    } else if (lx) {
      const r = R.parseHuman(lx[2], await D.chapters());
      if (!r) { toast('Could not read that reference'); return; }
      c.pins.push({ tier: 2, label: `Septuagint ${R.rangeLabel(r[0], r[1])}`, as: pinAs.value });
    } else {
      const r = R.parseHuman(s, await D.chapters());
      if (!r) { toast('Could not read that reference'); return; }
      for (const v of await D.passageVerses(r[0], r[1])) c.pins.push({ tier: 1, v, label: R.label(v), as: pinAs.value });
    }
    store[keyOf()] = c; pinSave(store); pinIn.value = ''; drawPins();
  };
  const run = async () => {
    const claim = input.value.trim();
    if (!claim) return;
    out.replaceChildren(loading('Searching the topical indexes, the words and the cross-reference graph'));
    const c = cur();
    const res = await runClaim(claim, { pins: c.pins, removed: c.removed });
    out.replaceChildren(...(await claimReport(res, c, () => { store[keyOf()] = c; pinSave(store); run(); })));
    Trail.record('claim', null, claim, { summary: res.weight });
  };
  setView(h('h1', null, 'Does the text bear it?'),
    h('p', { class: 'small muted' }, 'Threads looks for supporting texts, tension texts, variant dependencies and tier warnings. It shows the evidence and its weight. It never says whether a claim is true; that discernment is yours.'),
    input, h('div', { class: 'row', style: 'margin:8px 0' }, h('button', { class: 'btn primary', onclick: run }, 'Test the claim')),
    h('details', { class: 'card' }, h('summary', null, 'Pin or remove texts by hand'), h('div', { class: 'row' }, pinIn, pinAs, h('button', { class: 'btn', onclick: addPin }, 'Pin')), pinList),
    out);
  input.addEventListener('input', drawPins);
  drawPins();
  if (refHint) { const r = R.parseOsisRange(refHint); if (r) pinIn.value = R.rangeLabel(r[0], r[1]); }
  if (initial) run();
}
async function claimReport(res, c, rerun) {
  const parts = [h('div', { class: 'card' }, h('div', { class: 'weight' }, res.weight),
    h('div', { class: 'small muted' }, `Words searched: ${res.kws.map((k) => `${k.k} (${k.df} verses)`).join(', ') || 'none'}. Lemmas underneath: ${res.lemmas.map((l) => `${l.lemma} ${l.pk} "${l.gloss}"`).join(', ') || 'none'}. Topics: ${res.topics.map((t) => `${t.title} (${t.src === 'nave' ? 'Nave' : 'Torrey'})`).join('; ') || 'none'}.`))];
  for (const w of res.warnings) parts.push(h('div', { class: 'warnbox' }, w));
  const item = async (e, kind) => {
    const v = e.v;
    const tx = await D.bsbText(v);
    const why = [];
    if (e.pinned) why.push('pinned by you');
    if (e.kw && e.kw.size) why.push(`words: ${[...e.kw.keys()].join(', ')}`);
    if (e.lemma && e.lemma.size) why.push(`lemmas: ${[...e.lemma.keys()].join(', ')}`);
    if (e.topic && e.topic.length) why.push(`topic: ${[...new Set(e.topic.map((t) => `${t.title} (${t.src === 'nave' ? 'Nave' : 'Torrey'}): "${t.text.slice(0, 80)}"`))].slice(0, 2).join('; ')}`);
    if (e.graph && e.graph.length) why.push(`linked from ${e.graph.slice(0, 2).map((g) => `${R.label(g.from)} (${TYPE_NAMES[g.typ]}, ${g.score})`).join(', ')}`);
    if (e.markers && e.markers.length) why.push(`rule flag: ${e.markers.join(', ')}`);
    const ctxBox = h('div', { class: 'ctx' });
    const div = h('div', { class: 'result' },
      h('div', { class: 'group-head' }, h('span', null, tier(1, true), refLink(v), kind === 'support' && res.isDirect(e) ? h('span', { class: 'small' }, ' · direct') : null), h('span', { class: 'strength' }, e.score ? `strength ${e.score.toFixed(1)}` : '')),
      h('div', null, tx || h('span', { class: 'nodata' }, 'no BSB text')), h('div', { class: 'why' }, why.join(' · ')),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: async () => {
          if (ctxBox.childNodes.length) { ctxBox.replaceChildren(); return; }
          const [ca, cz] = await D.contextRange(v, v, 3);
          for (const x of await D.passageVerses(ca, cz)) ctxBox.append(h('div', { style: x === v ? 'font-weight:600' : '' }, h('span', { class: 'vn' }, R.parts(x)[2]), await D.bsbText(x)));
          ctxBox.append(cite(`BSB ${R.rangeLabel(ca, cz)}`, ['bsb']));
        } }, 'Context'),
        h('button', { class: 'btn small', onclick: () => { c.removed.push(v); c.pins = c.pins.filter((p) => p.v !== v); rerun(); } }, 'Remove'),
        h('a', { class: 'btn small', href: `#/web/${R.osisOf(v)}` }, 'Web')),
      ctxBox, cite(`BSB ${R.label(v)}`, ['bsb']));
    return div;
  };
  parts.push(h('h2', null, `Supporting texts (${res.supporting.length})`));
  for (const e of res.supporting) parts.push(await item(e, 'support'));
  parts.push(h('h2', null, `Tension texts (${res.tension.length})`), h('p', { class: 'small muted' }, 'Rule-flagged: texts that use the claim\'s words or lemmas together with a negation, limitation or condition. Read each in context; the rule only points.'));
  for (const e of res.tension) parts.push(await item(e, 'tension'));
  parts.push(h('h2', null, `Variant dependencies (${res.variants.length})`));
  if (!res.variants.length) parts.push(h('p', { class: 'muted' }, 'None found among these texts.'));
  for (const x of res.variants) parts.push(h('div', { class: 'result' }, refLink(x.v), ` (${x.group})`, h('ul', { class: 'small' }, x.notes.map((n) => h('li', null, n.text))), cite(`STEPBible TAHOT/TAGNT variant marks; SBLGNT; ETCBC/dss comparison`, ['stepbible', 'sblgnt', 'dss'])));
  parts.push(h('h2', null, `Tier warnings (${res.warnings.length})`));
  if (!res.warnings.length) parts.push(h('p', { class: 'muted' }, 'None. Every text above is Tier 1 Scripture.'));
  return parts;
}

// --------------------------------------------------------------------- trails
export function renderTrails() {
  const list = h('div');
  const draw = () => {
    const act = Trail.active();
    list.replaceChildren(...Trail.trails().map((t) => h('div', { class: 'card' },
      h('div', { class: 'group-head' }, h('a', { href: `#/trail/${t.id}` }, h('b', null, t.name)), h('span', { class: 'small muted' }, `${t.steps.length} steps`)),
      h('div', { class: 'row' }, act && act.id === t.id ? h('span', { class: 'small' }, 'Recording into this trail') : h('button', { class: 'btn small', onclick: () => { Trail.setActive(t.id); draw(); } }, 'Record here')))));
    if (!Trail.trails().length) list.append(h('p', { class: 'muted' }, 'No trails yet. Every passage, web, word and claim you open is recorded into the active trail.'));
  };
  const rec = h('button', { class: `chip${Trail.isRecording() ? ' on' : ''}`, onclick: () => { Trail.setRecording(!Trail.isRecording()); renderTrails(); } }, Trail.isRecording() ? 'Recording on' : 'Recording off');
  setView(h('h1', null, 'Study trails'), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { const n = prompt('Name for the new trail'); if (n !== null) { Trail.create(n.trim() || undefined); draw(); } } }, 'New trail'), rec), list);
  draw();
}
export function renderTrail(id) {
  const t = Trail.get(id);
  if (!t) { setView(h('p', null, 'Trail not found.')); return; }
  const steps = h('div');
  const draw = () => {
    steps.replaceChildren(...t.steps.map((st, i) => {
      const note = h('textarea', { placeholder: 'Your note', 'aria-label': 'Note' }, st.note || '');
      note.addEventListener('change', () => Trail.annotate(id, i, note.value));
      const r = st.ref && st.kind !== 'claim' && st.kind !== 'word' && st.kind !== 'link' ? R.parseOsisRange(st.ref) : null;
      return h('div', { class: 'step' }, h('div', { class: 'kind' }, st.kind),
        r ? h('a', { href: `#/${st.kind === 'web' ? 'web' : 'read'}/${st.ref}` }, st.text) : st.kind === 'word' ? h('a', { href: `#/word/${st.ref}` }, st.text) : h('span', null, st.text),
        st.data && st.data.summary ? h('div', { class: 'small muted' }, st.data.summary) : null, note,
        h('button', { class: 'btn small', onclick: () => { Trail.dropStep(id, i); draw(); } }, 'Remove step'));
    }));
  };
  const preview = h('pre', { class: 'card small', style: 'white-space:pre-wrap;display:none' });
  const show = (txt) => { preview.textContent = txt; preview.style.display = 'block'; };
  const safe = t.name.replace(/[^\w-]+/g, '_');
  setView(h('h1', null, t.name),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { const n = prompt('Rename trail', t.name); if (n) { Trail.rename(id, n); renderTrail(id); } } }, 'Rename'),
      h('button', { class: 'btn', onclick: () => { const md = Trail.toMarkdown(t); show(md); Trail.download(`${safe}.md`, md, 'text/markdown'); } }, 'Export Markdown'),
      h('button', { class: 'btn', onclick: () => { const js = Trail.toJSON(t); show(js); Trail.download(`${safe}.json`, js, 'application/json'); } }, 'Export JSON'),
      h('button', { class: 'btn primary', onclick: async () => { const s = await Trail.toSermon(t); show(s); Trail.download(`${safe}-sermon-skeleton.md`, s, 'text/markdown'); } }, 'Sermon skeleton'),
      h('button', { class: 'btn', onclick: () => { if (confirm('Delete this trail?')) { Trail.remove(id); location.hash = '#/trails'; } } }, 'Delete')),
    h('p', { class: 'small muted' }, 'The sermon skeleton builds the GOD section from this trail only. ME, WE, YOU and the closing WE are left as headings for you to fill.'),
    preview, steps);
  draw();
}

// --------------------------------------------------------------------- journeys
export async function renderJourney(id) {
  setView(loading());
  const all = await D.meta.journeys();
  const j = all[id];
  const aiData = await D.meta.ai();
  if (!j) { setView(h('p', null, 'Journey not found.')); return; }
  const out = [h('h1', null, j.title), h('p', { class: 'muted' }, j.summary),
    h('button', { class: 'btn', onclick: () => { for (const s of j.steps) Trail.record('journey', s.ref || null, `${j.title}: ${s.title}`); toast('Journey added to your trail'); } }, 'Add the whole journey to my trail')];
  setView(...out);
  const v = view();
  let n = 0;
  for (const s of j.steps) {
    n += 1;
    const sec = h('section', { class: 'card' }, h('h2', null, `${n}. ${s.title}`));
    v.append(sec);
    if (s.kind === 'passage') {
      const [a, z] = R.parseOsisRange(s.ref);
      const [ca, cz] = s.context ? R.parseOsisRange(s.context) : [a, z];
      for (const x of await D.passageVerses(ca, cz)) sec.append(await verseBlock(x, { ctx: x < a || x > z }));
      sec.append(h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/web/${s.ref}` }, 'See the web'), h('a', { class: 'btn', href: `#/read/${s.ref}` }, 'Read')));
    } else if (s.kind === 'heb-lxx') {
      sec.append(await hebLxxTable(s.ref), ai(aiData.journey_notes[s.note], aiData._by));
      sec.append(h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/web/${s.ref}` }, 'See the web'), h('a', { class: 'btn', href: `#/read/${s.ref}` }, 'Read')));
    } else if (s.kind === 'nt-lxx') {
      const [a, z] = R.parseOsisRange(s.ref);
      const det = h('details', null, h('summary', null, `Read ${R.rangeLabel(a, z)}`));
      for (const x of await D.passageVerses(a, z)) det.append(await verseBlock(x));
      sec.append(det, await quoteTable(s.quote, s.source), ai(aiData.journey_notes[s.note], aiData._by));
      sec.append(h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/web/${s.quote}` }, 'See the web')));
    } else if (s.kind === 'scroll') {
      sec.append(h('p', null, tier(3), 'Jewish background. Never presented as Scripture.'));
      for (const p of s.passages) sec.append(await scrollPassage(p, aiData));
      sec.append(ai(aiData.journey_notes[s.note], aiData._by));
    }
  }
}
async function hebLxxTable(ref) {
  const [a, z] = R.parseOsisRange(ref);
  const tb = h('table', { class: 'cmp' }, h('tr', null, h('th', null, 'Verse'), h('th', null, 'Hebrew (literal) and BSB'), h('th', null, tier(2, true), 'Septuagint and Brenton')));
  for (const v of await D.passageVerses(a, z)) {
    const [o, lx, hr] = await Promise.all([D.orig(v), D.lxx(v), D.hebRef(v)]);
    const lit = o ? o.w.map((w) => (w[2] || '').replace(/\//g, '').replace(/<[^>]*>/g, '').trim()).filter(Boolean).join(' ') : '';
    tb.append(h('tr', null, h('td', null, h('b', null, R.keyOf(v)), hr ? h('div', { class: 'note-heb' }, `Heb ${hr.replace('.', ':')}`) : null),
      h('td', null, h('div', { class: 'heb-text', style: 'font-size:1.1rem' }, o ? o.w.map((w) => w[0]).join(' ') : ''), h('div', { class: 'small' }, lit), h('div', null, await D.bsbText(v))),
      h('td', null, lx ? [h('div', { class: 'grk-text' }, lx[0]), h('div', null, lx[1])] : nodata())));
  }
  return h('div', null, tb, cite(`Hebrew: STEPBible TAHOT (WLC); English: BSB; Greek: Swete; English: Brenton. ${R.rangeLabel(a, z)}`, ['stepbible', 'bsb', 'lxx']));
}
// word-by-word comparison of a New Testament quotation with the Septuagint
async function quoteTable(quote, source) {
  const [qa, qz] = R.parseOsisRange(quote);
  const [sa] = R.parseOsisRange(source);
  const qs = await D.passageVerses(qa, qz);
  const tb = h('table', { class: 'cmp' }, h('tr', null, h('th', null, 'Acts (SBLGNT)'), h('th', null, tier(2, true), 'Joel in the Septuagint (Swete)')));
  for (let i = 0; i < qs.length; i++) {
    const v = qs[i];
    const sv = sa + i;
    const o = await D.orig(v);
    const lx = await D.lxx(sv);
    const aw = (o.g || '').split(/\s+/).filter(Boolean);
    const bw = (lx ? lx[0] : '').split(/\s+/).filter(Boolean);
    const { onlyA, onlyB } = diffWords(aw.map(D.normGreek), bw.map(D.normGreek));
    const glossOf = (word) => { const w = o.w.find((x) => D.normGreek(x[0]) === D.normGreek(word)); return w ? w[2] : ''; };
    const left = h('div', { class: 'grk-text' }, ...aw.map((w, k) => (onlyA.has(k) ? h('span', { class: 'diff-acts', title: glossOf(w) }, w) : w)).flatMap((x) => [x, ' ']));
    const right = h('div', { class: 'grk-text' }, ...bw.map((w, k) => (onlyB.has(k) ? h('span', { class: 'diff-lxx' }, w) : w)).flatMap((x) => [x, ' ']));
    const glosses = [...onlyA].map((k) => `${aw[k]} "${glossOf(aw[k])}"`).filter((x) => !x.endsWith('""'));
    tb.append(h('tr', null, h('td', null, h('b', null, R.label(v)), left, glosses.length ? h('div', { class: 'small muted' }, `Only in Acts: ${glosses.join('; ')}`) : null),
      h('td', null, h('b', null, R.label(sv)), right, lx ? h('div', { class: 'small' }, lx[1]) : nodata())));
  }
  return h('div', null, h('div', { class: 'legend-row' }, h('span', null, h('span', { class: 'diff-acts' }, 'word'), 'only in Acts'), h('span', null, h('span', { class: 'diff-lxx' }, 'word'), 'only in the Septuagint')), tb,
    cite(`SBLGNT ${R.rangeLabel(qa, qz)}; Swete ${source.replace(/\./g, ' ')}; glosses from STEPBible TAGNT. Computed by Threads (longest common subsequence of words, accents ignored).`, ['sblgnt', 'lxx', 'stepbible']));
}
export function diffWords(a, b) {
  const n = a.length; const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const onlyA = new Set(); const onlyB = new Set();
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { onlyA.add(i); i++; } else { onlyB.add(j); j++; }
  }
  while (i < n) onlyA.add(i++);
  while (j < m) onlyB.add(j++);
  return { onlyA, onlyB };
}
async function scrollPassage(p, aiData) {
  const m = /^(\S+)\s+(\d+):(\d+)-(\d+)$/.exec(p);
  const [, sc, col, l1, l2] = m;
  const t = await D.scrollText(sc);
  const box = h('div', { class: 'card box-t3' }, h('div', { class: 'row' }, h('b', null, `${sc} ${col}:${l1}-${l2}`), leonLevy(sc)));
  if (!t) { box.append(nodata()); return box; }
  for (const [fr, ln, words] of t.lines) {
    if (fr !== col || +ln < +l1 || +ln > +l2) continue;
    box.append(h('div', { class: 'heb-text' }, h('span', { class: 'small muted', style: 'font-family:system-ui;font-size:.75rem' }, `${fr}:${ln} `),
      ...words.map(([w, r]) => h('span', { class: `sw ${r === 1 ? 'r' : ''}${r === 2 ? ' part' : ''}` }, w)).flatMap((x) => [x, ' '])));
  }
  box.append(cite(`ETCBC/dss (Abegg), ${sc} ${col}:${l1}-${l2}. Faded words are the editor's reconstruction. Non-commercial license.`, ['dss']));
  const tr = aiData.dss_translations[p];
  if (tr) box.append(ai([h('p', null, h('b', null, 'Working translation (AI), verify against a published edition.')), ...tr.lines.map(([l, e]) => h('p', null, h('span', { class: 'small' }, `${l} `), e))], aiData._by));
  box.append(editionRef(p));
  return box;
}
function editionRef(p) {
  const key = `threads.edition.${p}`;
  let val = ''; try { val = localStorage.getItem(key) || ''; } catch { /* ignore */ }
  const inp = h('input', { type: 'text', placeholder: 'Your English DSS edition: page reference', value: val, 'aria-label': `Edition reference for ${p}` });
  inp.addEventListener('change', () => { try { localStorage.setItem(key, inp.value); } catch { /* ignore */ } toast('Edition reference saved on this device'); });
  return h('div', { style: 'margin-top:6px' }, inp);
}

// --------------------------------------------------------------------- scroll view
export async function renderScroll(id, at) {
  setView(loading());
  const t = await D.scrollText(id);
  const aiData = await D.meta.ai();
  if (!t) { setView(h('h1', null, id), h('p', null, 'This scroll is biblical; open its verses in the reader to see it beside the Masoretic Text.')); return; }
  const lines = h('div');
  for (const [fr, ln, words] of t.lines) {
    const here = at && at === `${fr}:${ln}`;
    lines.append(h('div', { class: 'heb-text', id: `l-${fr}-${ln}`, style: here ? 'background:var(--t3bg)' : '' }, h('span', { class: 'small muted', style: 'font-family:system-ui;font-size:.75rem' }, `${fr}:${ln} `),
      ...words.map(([w, r]) => h('span', { class: `sw ${r === 1 ? 'r' : ''}${r === 2 ? ' part' : ''}` }, w)).flatMap((x) => [x, ' '])));
  }
  const trs = Object.entries(aiData.dss_translations).filter(([, v]) => v.scroll === id);
  setView(h('h1', null, id), h('p', null, tier(3), 'Jewish background, not Scripture. Faded words are the editor\'s reconstruction.', ' ', leonLevy(id)),
    ...trs.map(([k, v]) => h('details', { class: 'card' }, h('summary', null, `Working translation (AI): ${v.title}`),
      ai([h('p', null, h('b', null, 'Working translation (AI), verify against a published edition.')), ...v.lines.map(([l, e]) => h('p', null, h('span', { class: 'small' }, `${l} `), e)), v.note ? h('p', { class: 'small' }, v.note) : null].filter(Boolean), aiData._by),
      editionRef(k))),
    lines, cite(`ETCBC/dss (Abegg), ${id}. Non-commercial license.`, ['dss']));
  if (at) document.getElementById(`l-${at.replace(':', '-')}`)?.scrollIntoView({ block: 'center' });
  Trail.record('scroll', null, `Scroll ${id}${at ? ` ${at}` : ''}`);
}

// --------------------------------------------------------------------- Josephus (Tier 3)
export async function renderJosephus(ref) {
  setView(loading());
  const [bk, ch, sec] = (ref || '1.1.1').split('.').map(Number);
  const b = await D.tryJSON(`josephus/ant/${bk}.json`);
  if (!b) { setView(h('h1', null, 'Josephus'), nodata()); return; }
  const chapter = b.chapters.find((c) => c[0] === ch) || b.chapters[0];
  const idx = b.chapters.indexOf(chapter);
  const prev = idx > 0 ? `${bk}.${b.chapters[idx - 1][0]}.1` : bk > 0 ? `${bk - 1}.1.1` : null;
  const next = idx < b.chapters.length - 1 ? `${bk}.${b.chapters[idx + 1][0]}.1` : bk < 20 ? `${bk + 1}.1.1` : null;
  const secs = chapter[2].map(([n, t]) => h('p', { id: `jos-${n}`, style: n === sec ? 'background:var(--t3bg);border-radius:6px;padding:4px' : '' }, h('b', null, `${n}. `), t));
  setView(h('h1', null, `Josephus, Antiquities ${bk}.${chapter[0]}`), h('p', null, tier(3), 'Jewish background, not Scripture.'),
    h('p', { class: 'small muted' }, `Book ${bk}: ${b.title}`), h('h2', null, chapter[1] || 'Preface'), h('div', { class: 'card box-t3' }, ...secs),
    cite(`Josephus, Antiquities of the Jews ${bk}.${chapter[0]} (Whiston's numbering), Project Gutenberg #2848`, ['josephus_ant']),
    h('div', { class: 'row' }, prev ? h('a', { class: 'btn', href: `#/josephus/${prev}` }, 'Previous chapter') : null, next ? h('a', { class: 'btn', href: `#/josephus/${next}` }, 'Next chapter') : null));
  if (sec) document.getElementById(`jos-${sec}`)?.scrollIntoView({ block: 'center' });
  Trail.record('scroll', null, `Josephus, Antiquities ${bk}.${chapter[0]}${sec ? `.${sec}` : ''}`);
}

// --------------------------------------------------------------------- home and about
export async function renderHome() {
  const j = await D.meta.journeys();
  const act = Trail.active();
  setView(h('h1', null, 'Threads'),
    h('p', null, 'Scripture study on the Hebrew and Greek, with every verse, link and variant traced to its source. Threads shows evidence and its weight; the discernment is yours.'),
    h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Start'), h('div', { class: 'chips' },
      ...[['Joel.2.28-Joel.2.32', 'Joel 2:28-32'], ['Acts.2.1-Acts.2.21', 'Acts 2:1-21'], ['1Cor.12.8-1Cor.12.10', '1 Cor 12:8-10'], ['Isa.53.11', 'Isa 53:11'], ['Deut.32.8', 'Deut 32:8']]
        .map(([r, t]) => h('a', { class: 'chip', href: `#/read/${r}` }, t))),
      h('p', { class: 'small muted' }, 'Or type a passage in the box at the top.')),
    h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Preset journeys'), ...Object.entries(j).map(([k, x]) => h('p', null, h('a', { href: `#/journey/${k}` }, h('b', null, x.title)), h('br'), h('span', { class: 'small muted' }, x.summary)))),
    h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Your trail'), act ? h('p', null, h('a', { href: `#/trail/${act.id}` }, act.name), ` (${act.steps.length} steps)`) : h('p', { class: 'muted' }, 'Your first step will start a trail.')),
    h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Offline'), await offlinePanel()),
    h('p', { class: 'small' }, h('a', { href: '#/about' }, 'Sources, licenses and how scores work'), ' · ', h('a', { href: 'selftest.html' }, 'Self-test')));
}
async function offlinePanel() {
  const box = h('div');
  const files = await D.meta.files();
  const status = h('div', { class: 'small muted' });
  const bar = h('div', { class: 'progress' }, h('div'));
  const packs = { core: 'Core (texts, words, lexicons, indexes)', links: 'Links and topics', witnesses: 'Witnesses (Septuagint, scrolls, Fathers)' };
  const sizeOf = (p) => files.packs[p].reduce((s, f) => s + f[1], 0);
  const btns = Object.entries(packs).map(([k, t]) => h('button', { class: 'btn small', onclick: () => cachePack([k]) }, `${t}, ${(sizeOf(k) / 1e6).toFixed(0)} MB`));
  const all = h('button', { class: 'btn primary', onclick: () => cachePack(Object.keys(packs)) }, `Everything for airplane mode, ${(files.total / 1e6).toFixed(0)} MB`);
  async function cachePack(list) {
    if (!('caches' in window)) { status.textContent = 'This browser cannot store files for offline use.'; return; }
    const cache = await caches.open(D.DATA_CACHE);
    const todo = list.flatMap((p) => files.packs[p].map((f) => f[0]));
    let done = 0;
    for (let i = 0; i < todo.length; i += 6) {
      await Promise.all(todo.slice(i, i + 6).map(async (f) => {
        const url = new URL(`data/${f}`, location.href).href;
        if (!(await cache.match(url))) { try { await cache.add(url); } catch { /* retried next time */ } }
        done += 1;
      }));
      bar.firstChild.style.width = `${(100 * done) / todo.length}%`;
      status.textContent = `${done} of ${todo.length} files stored`;
    }
    status.textContent = `Stored ${done} files. Threads will work in airplane mode for these packs.`;
  }
  box.append(h('p', { class: 'small' }, 'Threads stores what you open as you go. To be ready for airplane mode, store the packs below while online.'), all, h('div', { class: 'row', style: 'margin-top:6px' }, ...btns), bar, status,
    h('p', { class: 'small muted' }, `Data built ${files.built}.`));
  return box;
}
export async function renderAbout(focus) {
  setView(loading());
  const src = await D.meta.sources();
  const checks = await D.meta.checks();
  const focusIds = new Set((focus || '').split(',').filter(Boolean));
  const list = h('div');
  for (const s of src.sources) {
    list.append(h('div', { class: `card${focusIds.has(s.id) ? ' box-t1' : ''}`, id: `src-${s.id}` }, h('div', null, tier(s.tier, true), h('b', null, s.name)),
      h('div', { class: 'small' }, `Used for: ${s.used_for}`),
      h('div', { class: 'small' }, 'License: ', h('a', { href: s.license_url, target: '_blank', rel: 'noopener' }, s.license)),
      h('div', { class: 'small' }, `Attribution: ${s.attribution}`),
      h('div', { class: 'small' }, `Changes: ${s.changes}`),
      h('div', { class: 'small muted' }, 'Pinned: ', h('a', { href: `https://github.com/${s.repo}/tree/${s.commit}`, target: '_blank', rel: 'noopener' }, `${s.repo}@${s.commit.slice(0, 10)}`))));
  }
  const na = h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Not in this build'), h('ul', { class: 'small' }, src.not_available.map((x) => h('li', null, h('b', null, x.name), `: ${x.reason}`))));
  const c = checks.text ? checks.text.counts : {};
  const known = h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Known data issues found by the build checks'), h('ul', { class: 'small' },
    h('li', null, `BSB word alignment: ${c.bsb_tag_verified || 0} tags confirmed against the Hebrew or Greek of their verse; ${c.bsb_tag_not_in_verse || 0} tags name a Strong's number not found in that verse. Those show with a dotted underline and a warning.`),
    h('li', null, `BSB: ${c.bsb_verse_without_alignment || 0} verses (verse 1 of Psalms with titles) have no word alignment in the source data; the literal line still works.`),
    h('li', null, `SBLGNT and STEPBible TAGNT: ${c.tagnt_sbl_wordset_match || 0} verses match word for word; ${c.tagnt_sbl_wordset_mismatch || 0} differ, mostly spelling (movable nu, NA28 against SBL spelling) and verse-break placement.`),
    h('li', null, 'Scroll comparison: matched by letters, neutralising common scroll spellings. English for scroll-only words comes from a dictionary-form match and may be imprecise.'),
    h('li', null, 'STEPBible Hebrew includes words reconstructed from the Septuagint (type X) at a few places such as Psalm 145:13 and 1 Samuel 14:41. Threads marks them and never counts them as Masoretic.')));
  setView(h('h1', null, 'Sources and licenses'),
    h('p', null, 'Every verse, ancient text, link and variant in Threads cites one of these datasets and its exact location.'),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Source tiers'), h('p', null, tier(1), 'Scripture: the Hebrew and Aramaic Old Testament and the Greek New Testament, with English.'),
      h('p', null, tier(2), 'Textual witnesses: Dead Sea Scrolls biblical manuscripts, Septuagint. What did the text say?'),
      h('p', null, tier(3), 'Jewish background: Dead Sea Scrolls sectarian texts and Josephus. Never presented as Scripture.'),
      h('p', null, tier(4), 'Early church reception: the Ante-Nicene Fathers.'),
      h('p', { class: 'small' }, 'Tiers 2 to 4 can illuminate, confirm or complicate a reading. They can never be the only support for a claim.')),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'AI-generated text'), ai('Text written by AI looks like this and always carries this label. It is never used in a score.'),
      h('p', { class: 'small' }, 'In this build AI wrote: the five scroll variant notes, working translations of four Community Rule passages and of 4Q521 fragment 2, short reasons for some links on the Spirit thread, and three journey notes.')),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Non-commercial terms'), h('p', { class: 'small' }, 'The Dead Sea Scrolls data is licensed CC BY-NC 4.0. Threads must stay non-commercial while it includes that layer.')),
    known, na, list,
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Appearance'), h('div', { class: 'chips' }, ...['auto', 'light', 'dark'].map((t) => h('button', { class: `chip${(settings.theme || 'auto') === t ? ' on' : ''}`, onclick: () => { settings.theme = t; saveSettings(); applyTheme(); renderAbout(); } }, t)))));
  if (focusIds.size) document.getElementById(`src-${[...focusIds][0]}`)?.scrollIntoView({ block: 'start' });
}
export function applyTheme() {
  const t = settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
export { shortRef };
