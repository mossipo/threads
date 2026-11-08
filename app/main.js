// Router and start-up.
import { initSheet, closeSheet, h } from './ui.js';
import * as V from './views.js';
import * as D from './data.js';
import * as R from './refs.js';

const LAST_KEY = 'threads.last.v1';
let last = (() => { try { return localStorage.getItem(LAST_KEY) || 'Joel.2.28-Joel.2.32'; } catch { return 'Joel.2.28-Joel.2.32'; } })();
const remember = (r) => { last = r; try { localStorage.setItem(LAST_KEY, r); } catch { /* ignore */ } };

async function toRange(s) {
  if (!s) return null;
  const ch = await D.chapters();
  if (/^[1-3]?[A-Za-z]+\.\d+\.\d+(-[1-3]?[A-Za-z]+\.\d+\.\d+)?$/.test(s)) return R.parseOsisRange(s);
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)$/.exec(s);
  if (m) {
    const b = R.bookIndex(m[1]);
    const n = ch[m[1]] ? ch[m[1]][+m[2] - 1] : 0;
    return b && n ? [R.vid(b, +m[2], 1), R.vid(b, +m[2], n)] : null;
  }
  return R.parseHuman(decodeURIComponent(s), ch);
}

async function route() {
  closeSheet();
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const q = new URLSearchParams(qs || '');
  const [name, ...rest] = path.split('/');
  const arg = rest.join('/');
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (name || 'home') || (name === 'trail' && a.dataset.tab === 'trails')));
  try {
    switch (name) {
      case '': case 'home': await V.renderHome(); break;
      case 'read': case 'web': {
        const r = await toRange(arg || last);
        if (!r) { notFound(arg); break; }
        remember(R.rangeOsis(r[0], r[1]));
        if (name === 'read') await V.renderReader(r[0], r[1]); else await V.renderWeb(r[0], r[1]);
        break;
      }
      case 'word': await V.renderWord(decodeURIComponent(arg), q.get('v')); break;
      case 'test': await V.renderTest(q.get('claim') || '', q.get('ref')); break;
      case 'trails': V.renderTrails(); break;
      case 'trail': V.renderTrail(arg); break;
      case 'journey': await V.renderJourney(arg); break;
      case 'scroll': await V.renderScroll(decodeURIComponent(arg), q.get('at')); break;
      case 'josephus': await V.renderJosephus(arg); break;
      case 'about': await V.renderAbout(q.get('src')); break;
      default: notFound(raw);
    }
  } catch (e) {
    console.error(e);
    document.getElementById('view').replaceChildren(h('h1', null, 'Something went wrong'), h('p', null, String(e.message || e)),
      h('p', { class: 'small muted' }, navigator.onLine ? 'Try again.' : 'You are offline and this part of the data is not stored yet. Store it from Home while online.'));
  }
}
function notFound(s) {
  document.getElementById('view').replaceChildren(h('h1', null, 'Not found'), h('p', null, `Threads could not read "${decodeURIComponent(s || '')}" as a passage.`));
}

document.getElementById('go').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = document.getElementById('go-input');
  const r = R.parseHuman(inp.value, await D.chapters());
  if (!r) { inp.setCustomValidity('Try a reference like Joel 2:28-32'); inp.reportValidity(); return; }
  inp.setCustomValidity('');
  inp.blur();
  const mode = location.hash.startsWith('#/web') ? 'web' : 'read';
  location.hash = `#/${mode}/${R.rangeOsis(r[0], r[1])}`;
});
document.getElementById('go-input').addEventListener('input', (e) => e.target.setCustomValidity(''));

initSheet();
V.applyTheme();
window.addEventListener('hashchange', route);
route();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
}
