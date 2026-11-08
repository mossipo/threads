// A small force-directed layout drawn as SVG. Stronger links pull their node closer to the centre.
const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

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
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Links from ${center.label}` });
  svg.append(S('circle', { cx, cy, r: ring, fill: 'none', stroke: 'currentColor', 'stroke-opacity': 0.18, 'stroke-dasharray': '3 6' }));
  const ringLabel = S('text', { x: cx, y: cy - ring - 6, 'text-anchor': 'middle', class: 'node-label' });
  ringLabel.textContent = 'Witnesses ring (Tier 2 to 4)';
  svg.append(ringLabel);
  const edges = S('g', {}); const nodesG = S('g', {});
  svg.append(edges, nodesG);
  // witness ring
  witnesses.forEach((w, i) => {
    const ang = (i / Math.max(1, witnesses.length)) * Math.PI * 2 - Math.PI / 2 + 0.15;
    const x = cx + Math.cos(ang) * ring; const y = cy + Math.sin(ang) * ring;
    const line = S('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'edge w', 'stroke-width': 1.2 });
    edges.append(line);
    const g = S('g', { transform: `translate(${x},${y})`, tabindex: 0, role: 'button', 'aria-label': w.label, style: 'cursor:pointer' });
    const color = `var(--t${w.tier})`;
    if (w.tier === 2) g.append(S('rect', { x: -11, y: -11, width: 22, height: 22, rx: 3, fill: `var(--t2bg)`, stroke: color, 'stroke-width': 2, 'stroke-dasharray': '4 2' }));
    else if (w.tier === 3) g.append(S('polygon', { points: '0,-13 13,0 0,13 -13,0', fill: 'var(--t3bg)', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '2 2' }));
    else g.append(S('polygon', { points: '0,-13 12,-6 12,6 0,13 -12,6 -12,-6', fill: 'var(--t4bg)', stroke: color, 'stroke-width': 3 }));
    const t = S('text', { y: 26, 'text-anchor': 'middle', class: 'node-label' });
    t.textContent = w.short;
    g.append(t);
    g.addEventListener('click', () => handlers.witness(w));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') handlers.witness(w); });
    nodesG.append(g);
  });
  // scripture web
  for (const p of pts) {
    const n = p.n;
    const width = 1.2 + (n.score / max) * 4;
    const hit = S('line', { x1: cx, y1: cy, x2: p.x, y2: p.y, stroke: 'transparent', 'stroke-width': 16, class: 'edge' });
    const ln = S('line', { x1: cx, y1: cy, x2: p.x, y2: p.y, class: `edge ${n.typ}`, 'stroke-width': width, 'pointer-events': 'none' });
    hit.addEventListener('click', () => handlers.edge(n));
    edges.append(ln, hit);
  }
  for (const p of pts) {
    const n = p.n;
    const g = S('g', { transform: `translate(${p.x},${p.y})`, tabindex: 0, role: 'button', 'aria-label': n.label, style: 'cursor:pointer' });
    g.append(S('circle', { r: 8 + (n.score / max) * 6, fill: 'var(--t1bg)', stroke: 'var(--t1)', 'stroke-width': 2 }));
    const t = S('text', { y: -14 - (n.score / max) * 6, 'text-anchor': 'middle', class: 'node-label' });
    t.textContent = n.short;
    g.append(t);
    g.addEventListener('click', () => handlers.node(n));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') handlers.node(n); });
    nodesG.append(g);
  }
  const c = S('g', { transform: `translate(${cx},${cy})` });
  c.append(S('circle', { r: 22, fill: 'var(--t1)', stroke: 'var(--panel)', 'stroke-width': 3 }));
  const ct = S('text', { y: 44, 'text-anchor': 'middle', class: 'node-label', 'font-weight': 700 });
  ct.textContent = center.label;
  const bg = S('rect', { x: -center.label.length * 3.6 - 6, y: 31, width: center.label.length * 7.2 + 12, height: 18, rx: 4, fill: 'var(--panel)', 'fill-opacity': 0.9 });
  c.append(bg, ct);
  nodesG.append(c);
  container.replaceChildren(svg);
}
