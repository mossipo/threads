// Edition flags from STEPBible TAGNT: which printed Greek editions carry a verse's words.
// TAGNT word types: N = Greek in the Nestle-Aland editions, K = Greek behind the KJV (Scrivener 1894),
// O = other major editions. Brackets or lower case mark a smaller difference.
import { getJSON } from './data.js';
import { parts, bookOsis, keyOf, NT_START } from './refs.js';

export const EDITION_NAMES = ['NA28', 'NA27', 'Tyndale House GNT', 'SBLGNT', 'Westcott-Hort', 'Tregelles', 'Textus Receptus', 'Byzantine'];
const allBits = (1 << EDITION_NAMES.length) - 1;
export const editionList = (bits) => EDITION_NAMES.filter((_, i) => bits & (1 << i));

// Is this verse inside a double-bracketed passage ([[ ... ]] in the TAGNT Greek)? Walks the book in order.
async function insideDoubleBrackets(v) {
  const [b] = parts(v);
  const d = await getJSON(`orig/${bookOsis(b)}.json`);
  const keys = Object.keys(d.v).sort((x, y) => { const [a1, b1] = x.split(':').map(Number); const [a2, b2] = y.split(':').map(Number); return a1 - a2 || b1 - b2; });
  const want = keyOf(v);
  let open = false;
  for (const k of keys) {
    const ws = (d.v[k] && d.v[k].w) || [];
    let here = open;
    for (const w of ws) {
      if (w[0].includes('[[')) { open = true; here = true; }
      if (w[0].includes(']]')) { open = false; here = true; }
    }
    if (k === want) return here;
  }
  return false;
}

// Summary for one New Testament verse, or null when every word stands in the Nestle-Aland text.
export async function editionInfo(v, o) {
  if (parts(v)[0] < NT_START || !o || !o.w || !o.w.length) return null;
  const words = o.w;
  const notNA = words.filter((w) => !/N/.test(w[6]));
  const brackets = await insideDoubleBrackets(v);
  if (!brackets && notNA.length < 3 && notNA.length < words.length) return null;
  let any = 0; let all = allBits;
  for (const w of words) { any |= (w[9] || 0); all &= (w[9] || 0); }
  const types = [...new Set(words.map((w) => w[6]))];
  const whole = notNA.length === words.length;
  const missing = EDITION_NAMES.filter((_, i) => !(any & (1 << i)));
  const lines = [];
  if (brackets) lines.push('Double brackets [[ ]] in the TAGNT Greek: the Nestle-Aland convention for text its editors judge to be a later addition.');
  if (whole && (any & ~(1 << 6)) === 0) lines.push('This verse stands only in the Textus Receptus (the Greek behind the KJV).');
  else if (whole) lines.push('TAGNT does not count this verse as Nestle-Aland text (word type without N).');
  else lines.push(`${notNA.length} of ${words.length} words here are not counted as Nestle-Aland text.`);
  return {
    any, all, types, whole, brackets, notNA: notNA.length, words: words.length,
    inList: editionList(any), missing,
    sbl: o.g ? (/[⟦⟧]/.test(o.g) ? 'brackets' : 'present') : 'absent',
    lines,
  };
}
