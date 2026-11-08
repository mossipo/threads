// The constellation: a small force-directed layout drawn as SVG, gold threads on a night sky.
// Stronger links pull their node closer to the centre. Drag to move, pinch or use the buttons to zoom,
// tap a node or a thread. When a node becomes the new centre it glides there, so the eye can follow it.
const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const TIER = { 2: '#a9b8c6', 3: '#d09a68', 4: '#b9aad3' };
let previous = null; // positions from the last drawing, keyed by node label

export function drawConstellation(container, center, nodes, witnesses, handlers) {
  const W = 720; const H = 720; const cx = W / 2; const cy = H / 2;
  const inner = 250; const ring = 318;
  const max = Math.max(1, ...nodes.map((n) => n.score));
  const pts = nodes.map((n, i) => {
    const ang = (i / Math.max(1, nodes.length)) * Math.PI * 2 + 0.3;
    const rest = 105 + (1 - n.score / max) * (inner - 115);
    return { n, x: cx + Math.cos(ang) * rest, y: cy + Math.sin(ang) * rest, rest, vx: 0, vy: 0 };
  });
  for (let it = 0; it < 260; it++) {
    for (const p of pts) {
      const dx = p.x - cx; const dy = p.y - cy; const d = Math.hypot(dx, dy) || 1;
      const f = (p.rest - d) * 0.05;
      p.vx += (dx / d) * f; p.vy += (dy / d) * f;
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]; const b = pts[j];
        let dx = a.x - b.x; let dy = a.y - b.y; let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        if (d < 120) {
          const f = (120 - d) * 0.04;
          a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
      }
    }
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.6; p.vy *= 0.6;
      const dx = p.x - cx; const dy = p.y - cy; const d = Math.hypot(dx, dy);
      if (d > inner) { p.x = cx + (dx / d) * inner; p.y = cy + (dy / d) * inner; }
      if (d < 95) { p.x = cx + (dx / (d || 1)) * 95; p.y = cy + (dy / (d || 1)) * 95; }
    }
  }

  const svg = S('svg', { viewBox: `-30 -10 ${W + 60} ${H + 20}`, role: 'img', 'aria-label': `Links from ${center.label}. Drag to move, pinch to zoom.` });
  const vp = S('g', { class: 'viewport' });
  svg.append(vp);
  vp.append(S('circle', { cx, cy, r: ring, fill: 'none', stroke: '#b3a68b', 'stroke-opacity': 0.35, 'stroke-dasharray': '3 6' }));
  const ringLabel = S('text', { x: cx, y: cy - ring - 8, 'text-anchor': 'middle', class: 'node-label' });
  ringLabel.textContent = 'Witnesses ring (Tier 2 to 4)';
  vp.append(ringLabel);
  const edges = S('g', {}); const nodesG = S('g', {});
  vp.append(edges, nodesG);
  let dragged = false;
  const tap = (fn) => (e) => { if (dragged) { e.preventDefault(); return; } fn(); };

  // witness ring
  witnesses.forEach((w, i) => {
    const ang = (i / Math.max(1, witnesses.length)) * Math.PI * 2 - Math.PI / 2 + 0.15;
    const x = cx + Math.cos(ang) * ring; const y = cy + Math.sin(ang) * ring;
    edges.append(S('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'edge w', 'stroke-width': 1.2 }));
    const g = S('g', { transform: `translate(${x},${y})`, tabindex: 0, role: 'button', 'aria-label': w.label, style: 'cursor:pointer' });
    const color = TIER[w.tier] || TIER[2];
    g.append(S('circle', { r: 50, fill: 'transparent' }));
    if (w.tier === 2) g.append(S('rect', { x: -11, y: -11, width: 22, height: 22, rx: 3, fill: '#1a2026', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '4 2' }));
    else if (w.tier === 3) g.append(S('polygon', { points: '0,-13 13,0 0,13 -13,0', fill: '#2a1d12', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '2 2' }));
    else g.append(S('polygon', { points: '0,-13 12,-6 12,6 0,13 -12,6 -12,-6', fill: '#221d2c', stroke: color, 'stroke-width': 3 }));
    const t = S('text', { y: 36, 'text-anchor': 'middle', class: 'node-label' });
    t.textContent = w.short;
    g.append(t);
    g.addEventListener('click', tap(() => handlers.witness(w)));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') handlers.witness(w); });
    nodesG.append(g);
  });

  // scripture web
  const items = [];
  for (const p of pts) {
    const n = p.n;
    const width = 1.2 + (n.score / max) * 4;
    const hit = S('line', { x1: cx, y1: cy, x2: p.x, y2: p.y, stroke: 'transparent', 'stroke-width': 22, class: 'edge' });
    const ln = S('line', { x1: cx, y1: cy, x2: p.x, y2: p.y, class: `edge ${n.typ}`, 'stroke-width': width, 'pointer-events': 'none' });
    hit.addEventListener('click', tap(() => handlers.edge(n)));
    edges.append(ln, hit);
    const r = 8 + (n.score / max) * 6;
    const g = S('g', { transform: `translate(${p.x},${p.y})`, tabindex: 0, role: 'button', 'aria-label': n.label, style: 'cursor:pointer' });
    g.append(S('circle', { r: 50, fill: 'transparent' }));
    g.append(S('circle', { r, fill: '#2a2214', stroke: '#d8b45f', 'stroke-width': 2 }));
    const t = S('text', { y: -r - 9, 'text-anchor': 'middle', class: 'node-label' });
    t.textContent = n.short;
    g.append(t);
    g.addEventListener('click', tap(() => handlers.node(n)));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') handlers.node(n); });
    nodesG.append(g);
    items.push({ p, g, ln, hit });
  }
  const c = S('g', { transform: `translate(${cx},${cy})` });
  c.append(S('circle', { r: 22, fill: '#d8b45f', stroke: '#0f0d0a', 'stroke-width': 3 }));
  const ct = S('text', { y: 52, 'text-anchor': 'middle', class: 'node-label', 'font-weight': 700 });
  ct.textContent = center.label;
  c.append(ct);
  nodesG.append(c);

  // pan and zoom: one finger or the mouse moves the web, two fingers pinch, the wheel zooms
  let k = 1; let tx = 0; let ty = 0;
  const apply = () => vp.setAttribute('transform', `translate(${tx},${ty}) scale(${k})`);
  const toSvg = (x, y) => { const m = svg.getScreenCTM(); if (!m) return { x, y }; const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; return pt.matrixTransform(m.inverse()); };
  const zoomAt = (f, sx, sy) => { const nk = Math.min(4, Math.max(0.6, k * f)); tx = sx - ((sx - tx) * nk) / k; ty = sy - ((sy - ty) * nk) / k; k = nk; apply(); };
  const ptrs = new Map();
  let start = null;
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { dragged = false; start = { x: e.clientX, y: e.clientY, tx, ty }; }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1 && start) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) dragged = true;
      if (dragged) {
        const a = toSvg(start.x, start.y); const b = toSvg(e.clientX, e.clientY);
        tx = start.tx + (b.x - a.x); ty = start.ty + (b.y - a.y); apply();
      }
    } else if (ptrs.size === 2) {
      dragged = true;
      const [p1, p2] = [...ptrs.values()];
      const other = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
      const after = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const mid = toSvg((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      zoomAt(after / before, mid.x, mid.y);
    }
  });
  const end = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) start = null; setTimeout(() => { if (!ptrs.size) dragged = false; }, 0); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const m = toSvg(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, m.x, m.y); }, { passive: false });
  const btn = (label, aria, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.addEventListener('click', fn); return b; };
  const tools = document.createElement('div');
  tools.className = 'graph-tools';
  tools.append(btn('+', 'Zoom in', () => zoomAt(1.3, cx, cy)), btn('−', 'Zoom out', () => zoomAt(1 / 1.3, cx, cy)), btn('↺', 'Reset view', () => { k = 1; tx = 0; ty = 0; apply(); }));
  container.replaceChildren(svg, tools);

  // orientation: if the new centre was a node a moment ago, it glides from there to the middle,
  // and the new links unfold from the centre
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = previous && previous.get(center.label);
  previous = new Map(pts.map((p) => [p.n.label, { x: p.x, y: p.y }]));
  if (reduce || !from) return;
  const t0 = performance.now(); const dur = 520;
  const ease = (t) => 1 - (1 - t) ** 3;
  const frame = (now) => {
    const t = ease(Math.min(1, (now - t0) / dur));
    const ccx = from.x + (cx - from.x) * t; const ccy = from.y + (cy - from.y) * t;
    c.setAttribute('transform', `translate(${ccx},${ccy})`);
    for (const it of items) {
      const x = ccx + (it.p.x - ccx) * t; const y = ccy + (it.p.y - ccy) * t;
      it.g.setAttribute('transform', `translate(${x},${y})`);
      for (const l of [it.ln, it.hit]) { l.setAttribute('x1', ccx); l.setAttribute('y1', ccy); l.setAttribute('x2', x); l.setAttribute('y2', y); }
    }
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
