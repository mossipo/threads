// Study trails: every step through the web is recorded into the active trail.
import { parseOsisRange, rangeLabel, label, parseOsis } from './refs.js';
import { bsbText, passageVerses } from './data.js';

const KEY = 'threads.trails.v1';
let state = null;

function load() {
  if (state) return state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || null; } catch { state = null; }
  if (!state || !Array.isArray(state.trails)) state = { trails: [], active: null, recording: true };
  return state;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } }
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function trails() { return load().trails; }
export function active() { const s = load(); return s.trails.find((t) => t.id === s.active) || null; }
export function isRecording() { return load().recording !== false; }
export function setRecording(on) { load().recording = !!on; save(); }
export function create(name) {
  const s = load();
  const t = { id: newId(), name: name || `Trail ${new Date().toLocaleDateString()}`, created: Date.now(), steps: [] };
  s.trails.unshift(t);
  s.active = t.id;
  save();
  return t;
}
export function setActive(id) { load().active = id; save(); }
export function rename(id, name) { const t = get(id); if (t) { t.name = name; save(); } }
export function remove(id) { const s = load(); s.trails = s.trails.filter((t) => t.id !== id); if (s.active === id) s.active = s.trails[0]?.id || null; save(); }
export function get(id) { return load().trails.find((t) => t.id === id) || null; }
export function annotate(id, i, note) { const t = get(id); if (t && t.steps[i]) { t.steps[i].note = note; save(); } }
export function dropStep(id, i) { const t = get(id); if (t) { t.steps.splice(i, 1); save(); } }

// kind: passage | web | word | link | claim | journey | scroll
export function record(kind, ref, text, data) {
  if (!isRecording()) return;
  const s = load();
  let t = active();
  if (!t) t = create();
  const last = t.steps[t.steps.length - 1];
  if (last && last.kind === kind && last.ref === ref && last.text === text) return;
  t.steps.push({ at: Date.now(), kind, ref, text, data: data || null, note: '' });
  if (t.steps.length > 500) t.steps.shift();
  save();
  return t;
}

// ---------------- backup and restore: trails with their notes, pins, edition page references, settings
const KEEP = (k) => k === KEY || k === 'threads.pins.v1' || k === 'threads.settings.v1' || k.startsWith('threads.edition.');
export function backup() {
  const out = { format: 'threads-backup-1', made: new Date().toISOString(), items: {} };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && KEEP(k)) out.items[k] = localStorage.getItem(k);
    }
  } catch { /* storage unavailable */ }
  return JSON.stringify(out, null, 2);
}
// Merges a backup (or a single exported trail) into this device. Existing trails with the same id are kept;
// new ones are added. Pins merge per claim; edition references and settings from the file replace these.
export function restore(text) {
  const d = JSON.parse(text);
  const s = load();
  let trailsAdded = 0; let other = 0;
  const addTrail = (t) => {
    if (!t || !Array.isArray(t.steps)) return;
    if (s.trails.some((x) => x.id === t.id)) return;
    s.trails.push({ id: t.id || newId(), name: t.name || 'Imported trail', created: t.created || Date.now(), steps: t.steps });
    trailsAdded += 1;
  };
  if (d.format === 'threads-trail-1') addTrail(d);
  else if (d.format === 'threads-backup-1' && d.items) {
    for (const [k, v] of Object.entries(d.items)) {
      if (!KEEP(k)) continue;
      if (k === KEY) { try { for (const t of (JSON.parse(v).trails || [])) addTrail(t); } catch { /* skip */ } continue; }
      try {
        if (k === 'threads.pins.v1') {
          const mine = JSON.parse(localStorage.getItem(k) || '{}'); const theirs = JSON.parse(v || '{}');
          for (const [claim, c] of Object.entries(theirs)) {
            const m = mine[claim] || { pins: [], removed: [] };
            for (const p of c.pins || []) if (!m.pins.some((x) => x.label === p.label && x.as === p.as)) m.pins.push(p);
            for (const r of c.removed || []) if (!m.removed.includes(r)) m.removed.push(r);
            mine[claim] = m;
          }
          localStorage.setItem(k, JSON.stringify(mine));
        } else localStorage.setItem(k, v);
        other += 1;
      } catch { /* storage unavailable */ }
    }
  } else throw new Error('This file is not a Threads backup or trail.');
  save();
  return { trailsAdded, other };
}

// ---------------- exports
export function toJSON(t) { return JSON.stringify({ format: 'threads-trail-1', ...t }, null, 2); }

export function toMarkdown(t) {
  const lines = [`# ${t.name}`, '', `Recorded with Threads, ${new Date(t.created).toLocaleString()}.`, ''];
  t.steps.forEach((st, i) => {
    lines.push(`${i + 1}. **${st.text}** (${st.kind})`);
    if (st.data && st.data.summary) lines.push(`   ${st.data.summary}`);
    if (st.note) lines.push(`   Note: ${st.note}`);
  });
  return lines.join('\n') + '\n';
}

// ME-WE-GOD-YOU-WE skeleton. GOD is built only from the trail; every other section is a heading
// with a prompt for the pastor. Threads never writes application or the altar call.
export async function toSermon(t) {
  const out = [`# ${t.name}`, '', 'Sermon skeleton (ME-WE-GOD-YOU-WE) built from a Threads study trail.', ''];
  out.push('## ME', '', '_Your words: where this text has met you._', '');
  out.push('## WE', '', '_Your words: where the congregation feels the same tension._', '');
  out.push('## GOD', '', 'Texts and evidence from the trail, in the order you walked them:', '');
  let n = 0;
  for (const st of t.steps) {
    if (st.kind === 'passage' || st.kind === 'web' || st.kind === 'journey') {
      const r = st.ref ? parseOsisRange(st.ref) : null;
      if (!r) continue;
      n += 1;
      out.push(`### ${n}. ${rangeLabel(r[0], r[1])}`, '');
      const vs = await passageVerses(r[0], r[1]);
      const texts = [];
      for (const v of vs.slice(0, 30)) { const tx = await bsbText(v); if (tx) texts.push(tx); }
      if (texts.length) out.push(`> ${texts.join(' ')}`, '', `(Berean Standard Bible, ${rangeLabel(r[0], r[1])})`, '');
      if (st.note) out.push(`Your note: ${st.note}`, '');
    } else if (st.kind === 'link') {
      n += 1;
      out.push(`### ${n}. ${st.text}`, '');
      if (st.data && st.data.summary) out.push(st.data.summary, '');
      if (st.note) out.push(`Your note: ${st.note}`, '');
    } else if (st.kind === 'word') {
      n += 1;
      out.push(`### ${n}. Word: ${st.text}`, '');
      if (st.data && st.data.summary) out.push(st.data.summary, '');
      if (st.note) out.push(`Your note: ${st.note}`, '');
    } else if (st.kind === 'claim') {
      n += 1;
      out.push(`### ${n}. Claim tested: "${st.text}"`, '');
      if (st.data && st.data.summary) out.push(st.data.summary, '');
      if (st.note) out.push(`Your note: ${st.note}`, '');
    }
  }
  if (!n) out.push('_The trail has no passages yet._', '');
  out.push('## YOU', '', '_Your words: the response you will call for. Threads leaves this to you._', '');
  out.push('## WE', '', '_Your words: the shared vision, and your altar or prayer focus. Threads leaves this to you._', '');
  return out.join('\n');
}

export function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export { label, parseOsis };
