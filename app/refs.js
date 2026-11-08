// Books, verse ids and reference parsing. Verse id = book * 1000000 + chapter * 1000 + verse.
export const BOOKS = [
  ['Gen', 'Genesis', 'gen ge gn'], ['Exod', 'Exodus', 'exod ex exo'], ['Lev', 'Leviticus', 'lev le lv'],
  ['Num', 'Numbers', 'num nu nm nb'], ['Deut', 'Deuteronomy', 'deut de dt deu'], ['Josh', 'Joshua', 'josh jos jsh'],
  ['Judg', 'Judges', 'judg jdg jg jdgs'], ['Ruth', 'Ruth', 'ruth ru rth'], ['1Sam', '1 Samuel', '1sam 1sa 1sm 1s'],
  ['2Sam', '2 Samuel', '2sam 2sa 2sm 2s'], ['1Kgs', '1 Kings', '1kgs 1ki 1kg 1k 1kings'], ['2Kgs', '2 Kings', '2kgs 2ki 2kg 2k 2kings'],
  ['1Chr', '1 Chronicles', '1chr 1ch 1chron'], ['2Chr', '2 Chronicles', '2chr 2ch 2chron'], ['Ezra', 'Ezra', 'ezra ezr'],
  ['Neh', 'Nehemiah', 'neh ne'], ['Esth', 'Esther', 'esth est es'], ['Job', 'Job', 'job jb'],
  ['Ps', 'Psalms', 'ps psa psalm pss psalms'], ['Prov', 'Proverbs', 'prov pr pro prv'], ['Eccl', 'Ecclesiastes', 'eccl ecc ec qoh'],
  ['Song', 'Song of Songs', 'song sng sos so canticles songofsolomon songofsongs'], ['Isa', 'Isaiah', 'isa is'], ['Jer', 'Jeremiah', 'jer je jr'],
  ['Lam', 'Lamentations', 'lam la'], ['Ezek', 'Ezekiel', 'ezek eze ezk'], ['Dan', 'Daniel', 'dan da dn'],
  ['Hos', 'Hosea', 'hos ho'], ['Joel', 'Joel', 'joel jl joe jol'], ['Amos', 'Amos', 'amos am amo'],
  ['Obad', 'Obadiah', 'obad ob oba'], ['Jonah', 'Jonah', 'jonah jon jnh'], ['Mic', 'Micah', 'mic mi'],
  ['Nah', 'Nahum', 'nah na nam'], ['Hab', 'Habakkuk', 'hab hb'], ['Zeph', 'Zephaniah', 'zeph zep zp'],
  ['Hag', 'Haggai', 'hag hg'], ['Zech', 'Zechariah', 'zech zec zc'], ['Mal', 'Malachi', 'mal ml'],
  ['Matt', 'Matthew', 'matt mt mat'], ['Mark', 'Mark', 'mark mk mrk mr'], ['Luke', 'Luke', 'luke lk luk'],
  ['John', 'John', 'john jn jhn joh'], ['Acts', 'Acts', 'acts ac act'], ['Rom', 'Romans', 'rom ro rm'],
  ['1Cor', '1 Corinthians', '1cor 1co'], ['2Cor', '2 Corinthians', '2cor 2co'], ['Gal', 'Galatians', 'gal ga'],
  ['Eph', 'Ephesians', 'eph ephes'], ['Phil', 'Philippians', 'phil php pp'], ['Col', 'Colossians', 'col co'],
  ['1Thess', '1 Thessalonians', '1thess 1th 1thes'], ['2Thess', '2 Thessalonians', '2thess 2th 2thes'], ['1Tim', '1 Timothy', '1tim 1ti 1tm'],
  ['2Tim', '2 Timothy', '2tim 2ti 2tm'], ['Titus', 'Titus', 'titus tit ti'], ['Phlm', 'Philemon', 'phlm phm philem philemon'],
  ['Heb', 'Hebrews', 'heb he'], ['Jas', 'James', 'jas jam jm james'], ['1Pet', '1 Peter', '1pet 1pe 1pt 1p'],
  ['2Pet', '2 Peter', '2pet 2pe 2pt 2p'], ['1John', '1 John', '1john 1jn 1jo 1j'], ['2John', '2 John', '2john 2jn 2jo 2j'],
  ['3John', '3 John', '3john 3jn 3jo 3j'], ['Jude', 'Jude', 'jude jud jd'], ['Rev', 'Revelation', 'rev re rv revelation revelations'],
];
export const NT_START = 40;
const ALIAS = new Map();
BOOKS.forEach(([osis, name, al], i) => {
  const idx = i + 1;
  for (const a of [osis.toLowerCase(), name.toLowerCase().replace(/\s+/g, ''), ...al.split(' ')]) ALIAS.set(a, idx);
});
export const bookIndex = (osis) => BOOKS.findIndex((b) => b[0] === osis) + 1;
export const bookOsis = (i) => BOOKS[i - 1][0];
export const bookName = (i) => BOOKS[i - 1][1];
export const isNT = (v) => Math.floor(v / 1e6) >= NT_START;

export const vid = (b, c, v) => b * 1e6 + c * 1e3 + v;
export const parts = (v) => [Math.floor(v / 1e6), Math.floor(v / 1e3) % 1000, v % 1000];
export const osisOf = (v) => { const [b, c, vv] = parts(v); return `${bookOsis(b)}.${c}.${vv}`; };
export const keyOf = (v) => { const [, c, vv] = parts(v); return `${c}:${vv}`; };
export function label(v) { const [b, c, vv] = parts(v); return `${bookName(b)} ${c}:${vv}`; }
export function rangeLabel(a, z) {
  if (!z || a === z) return label(a);
  const [b1, c1, v1] = parts(a); const [b2, c2, v2] = parts(z);
  if (b1 !== b2) return `${label(a)} to ${label(z)}`;
  if (c1 !== c2) return `${bookName(b1)} ${c1}:${v1}-${c2}:${v2}`;
  return `${bookName(b1)} ${c1}:${v1}-${v2}`;
}
export function parseOsis(s) {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(s.trim());
  if (!m) return null;
  const b = bookIndex(m[1]);
  return b ? vid(b, +m[2], +m[3]) : null;
}
export function parseOsisRange(s) {
  const [a, z] = s.split('-');
  const A = parseOsis(a); const Z = z ? parseOsis(z) : A;
  return A ? [A, Z || A] : null;
}
export const rangeOsis = (a, z) => (a === z ? osisOf(a) : `${osisOf(a)}-${osisOf(z)}`);

// Human input: "Joel 2:28-32", "1 cor 12:8-10", "Ps 145", "jn 3:16", "Joel 2:28-3:2"
export function parseHuman(input, chapters) {
  let s = input.trim().toLowerCase().replace(/[.]/g, ' ').replace(/\b(iii)\s/, '3').replace(/\b(ii)\s/, '2').replace(/\b(i)\s(?=[a-z])/, '1');
  s = s.replace(/\s+/g, ' ');
  const m = /^([1-3]?\s?[a-z ]+?)\s*(\d+)?(?::(\d+))?(?:\s*[-–]\s*(\d+)(?::(\d+))?)?$/.exec(s);
  if (!m) return null;
  const key = m[1].replace(/\s+/g, '');
  const b = ALIAS.get(key);
  if (!b) return null;
  const osis = bookOsis(b);
  const chs = chapters ? chapters[osis] : null;
  const c1 = m[2] ? +m[2] : 1;
  let v1; let c2; let v2;
  if (m[3]) {
    v1 = +m[3];
    if (m[4] && m[5]) { c2 = +m[4]; v2 = +m[5]; } else if (m[4]) { c2 = c1; v2 = +m[4]; } else { c2 = c1; v2 = v1; }
  } else {
    v1 = 1;
    c2 = m[4] ? +m[4] : c1;
    v2 = chs ? chs[c2 - 1] || 1 : 1;
  }
  if (chs) {
    if (!chs[c1 - 1] || !chs[c2 - 1]) return null;
    v2 = Math.min(v2, chs[c2 - 1]);
    v1 = Math.min(v1, chs[c1 - 1]);
  }
  const A = vid(b, c1, v1); const Z = vid(b, c2, v2);
  return Z < A ? [A, A] : [A, Z];
}

// every verse id from a to z, using the chapter table
export function versesIn(a, z, chapters) {
  const out = [];
  const [b, c1, v1] = parts(a); const [, c2, v2] = parts(z);
  const chs = chapters[bookOsis(b)];
  for (let c = c1; c <= c2; c++) {
    const last = c === c2 ? v2 : chs[c - 1];
    for (let v = c === c1 ? v1 : 1; v <= last; v++) out.push(vid(b, c, v));
  }
  return out;
}
export function shiftVerse(v, delta, chapters) {
  let [b, c, vv] = parts(v);
  const chs = chapters[bookOsis(b)];
  vv += delta;
  while (vv < 1 && c > 1) { c -= 1; vv += chs[c - 1]; }
  while (vv > chs[c - 1] && c < chs.length) { vv -= chs[c - 1]; c += 1; }
  vv = Math.max(1, Math.min(vv, chs[c - 1]));
  return vid(b, c, vv);
}
