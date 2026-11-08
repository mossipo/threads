// Small DOM helpers and shared pieces of interface.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TIER_NAMES = { 1: 'Tier 1 Scripture', 2: 'Tier 2 Witness', 3: 'Tier 3 Background', 4: 'Tier 4 Reception' };
export function tier(n, short) {
  return h('span', { class: `tier t${n}`, title: TIER_NAMES[n] }, short ? `T${n}` : TIER_NAMES[n]);
}

// AI text is always wrapped like this, so it can never be mistaken for source data
export function ai(content, note) {
  const box = h('div', { class: 'ai', 'data-ai': '1' },
    h('span', { class: 'ai-label' }, 'AI-generated'),
    note ? h('span', { class: 'small' }, note) : null);
  for (const p of [].concat(content)) box.append(typeof p === 'string' ? h('p', null, p) : p);
  return box;
}

// a citation line: dataset name + exact location; tapping opens the source details
export function cite(text, sourceIds) {
  const c = h('span', { class: 'cite', 'data-cite': '1' }, text);
  if (sourceIds && sourceIds.length) {
    c.append(' ', h('a', { href: `#/about?src=${sourceIds.join(',')}` }, 'source'));
  }
  return c;
}

export function nodata(msg) { return h('span', { class: 'nodata' }, msg || 'no data'); }

// bottom sheet
const sheet = () => document.getElementById('sheet');
let lastFocus = null;
export function openSheet(title, body) {
  const s = sheet();
  lastFocus = document.activeElement;
  document.getElementById('sheet-title').textContent = title;
  const b = document.getElementById('sheet-body');
  b.replaceChildren(...[].concat(body));
  s.hidden = false;
  s.querySelector('.sheet-panel').scrollTop = 0;
  s.querySelector('[data-close].icon-btn').focus();
}
export function closeSheet() { sheet().hidden = true; if (lastFocus) lastFocus.focus?.(); }
export function initSheet() {
  sheet().addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet().hidden) closeSheet(); });
}
export function setSheetBody(body) { document.getElementById('sheet-body').replaceChildren(...[].concat(body)); }

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

export function loading(msg) { return h('p', { class: 'loading' }, msg || 'Loading'); }

export const TYPE_NAMES = { q: 'Direct quotation', a: 'Clear allusion', l: 'Shared key lemma', t: 'Typology', e: 'Thematic echo' };
export const TYPE_HELP = {
  q: 'A New Testament verse shares 4 or more consecutive words with the Septuagint of this Old Testament verse.',
  a: 'A 3-word shared run with the Septuagint, a New Testament and Old Testament pair on Nave\'s quotation list, or 3 or more rare shared lemmas together with OpenBible votes or a TSK listing.',
  l: 'The two passages share at least one rare lemma (used in about 1 verse in 33 or fewer).',
  t: 'Both passages are listed in one typology entry of Nave\'s or Torrey\'s topical index.',
  e: 'Linked by OpenBible or the TSK without enough shared vocabulary for a stronger type.',
};
export function typeSwatch(t) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 46 10');
  const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  ln.setAttribute('x1', 2); ln.setAttribute('x2', 44); ln.setAttribute('y1', 5); ln.setAttribute('y2', 5);
  ln.setAttribute('stroke-width', t === 'q' ? 4 : t === 'a' ? 3 : 2);
  ln.setAttribute('class', `edge ${t}`);
  svg.append(ln);
  return svg;
}
export function legend() {
  const g = h('div', { class: 'legend' });
  for (const t of ['q', 'a', 'l', 't', 'e']) g.append(typeSwatch(t), h('span', null, h('b', null, TYPE_NAMES[t]), ': ', TYPE_HELP[t]));
  g.append(typeSwatch('w'), h('span', null, h('b', null, 'Witness ring'), ': Tier 2 to 4 texts. They never count toward a link score.'));
  return g;
}
