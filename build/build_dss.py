#!/usr/bin/env python3
"""Dead Sea Scrolls layer (ETCBC/dss, CC BY-NC 4.0).

  data/dss/bib/<Book>.json   biblical scroll readings per English verse, compared word by word
                             with the Masoretic Text (STEPBible TAHOT letters)
  data/dss/scrolls.json      list of scrolls with word counts and whether they are biblical
  data/dss/text/<scroll>.json  every non-biblical scroll, line by line (Tier 3)
  data/dss/lex/<k>.json      where each Hebrew lexeme occurs in the scrolls

Status codes for each scroll word, compared with the Masoretic verse:
  s  same letters
  o  same word, spelling only (matres lectionis, long suffix forms)
  d  different word where the Masoretic Text has another word
  p  extra word the Masoretic Text lacks
  c  same word except for a joining "and" (waw)
  r  wholly reconstructed by the modern editor (not evidence)
Masoretic words inside the preserved stretch with no scroll counterpart are listed as "m"
(omitted or damaged; the data cannot tell which).
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BOOKS, BY_OSIS, SRC, vid, vid_parts, write_json, read_json, heb_consonants

TF = os.path.join(SRC, "dss/tf/2.0.4")
DSS_BOOK = {"Is": "Isa", "Ex": "Exod", "Ezek": "Ezek", "Ps": "Ps", "Song": "Song", "Eccl": "Eccl",
            "Prov": "Prov", "Lam": "Lam", "Ruth": "Ruth", "Obad": "Obad", "Jonah": "Jonah", "Joel": "Joel",
            "Amos": "Amos", "Hos": "Hos", "Mic": "Mic", "Nah": "Nah", "Hab": "Hab", "Zeph": "Zeph",
            "Hag": "Hag", "Zech": "Zech", "Mal": "Mal", "Gen": "Gen", "Lev": "Lev", "Num": "Num",
            "Deut": "Deut", "Josh": "Josh", "Judg": "Judg", "1Sam": "1Sam", "2Sam": "2Sam",
            "1Kgs": "1Kgs", "2Kgs": "2Kgs", "Jer": "Jer", "Job": "Job", "Dan": "Dan", "Ezra": "Ezra",
            "Neh": "Neh", "1Chr": "1Chr", "2Chr": "2Chr", "Esth": "Esth"}


def load_feature(name):
    vals = {}
    path = os.path.join(TF, name + ".tf")
    with open(path, encoding="utf-8") as f:
        header = True
        node = 0
        for line in f:
            line = line.rstrip("\n")
            if header:
                if line == "":
                    header = False
                continue
            if "\t" in line:
                spec, val = line.split("\t", 1)
                nodes = []
                for part in spec.split(","):
                    if "-" in part:
                        a, b = part.split("-")
                        nodes.extend(range(int(a), int(b) + 1))
                    else:
                        nodes.append(int(part))
            else:
                nodes, val = [node + 1], line
            for n in nodes:
                vals[n] = val
            node = nodes[-1]
    return vals


def load_oslots():
    slots = {}
    path = os.path.join(TF, "oslots.tf")
    with open(path, encoding="utf-8") as f:
        header = True
        node = None
        for line in f:
            line = line.rstrip("\n")
            if header:
                if line == "":
                    header = False
                continue
            if "\t" in line:
                n, spec = line.split("\t", 1)
                node = int(n)
            else:
                spec = line
                node = node + 1 if node is not None else None
            first, last = None, None
            for part in spec.split(","):
                a, _, b = part.partition("-")
                a = int(a)
                b = int(b) if b else a
                first = a if first is None else min(first, a)
                last = b if last is None else max(last, b)
            slots[node] = (first, last)
    return slots


def otype_ranges():
    out = {}
    with open(os.path.join(TF, "otype.tf"), encoding="utf-8") as f:
        header = True
        for line in f:
            line = line.rstrip("\n")
            if header:
                if line == "":
                    header = False
                continue
            spec, t = line.split("\t")
            a, b = spec.split("-")
            out[t] = (int(a), int(b))
    return out


# ------------------------------------------------------------------ comparison
def norm_cons(word):
    c = heb_consonants(word)
    return c


def norm_spelling(c):
    """Neutralise common scroll orthography: internal matres lectionis and long suffix forms.

    Final waw and final yod are kept, because there they usually carry meaning (his / my).
    """
    if len(c) < 3:
        return c
    if re.search(r"(כה|תה|כמה|המה|וה|אה)$", c):
        c = c[:-1]  # long forms: -כה for -ך, -תה, -כמה, -המה, הואה for הוא
    if len(c) < 3:
        return c
    head, mid, last = c[0], c[1:-1], c[-1]
    mid = mid.replace("ו", "").replace("י", "")
    s = head + mid + last
    s = re.sub(r"(?<=.)א$", "", s) if len(s) > 2 else s
    return s


def core(c):
    """Spelling-neutral form without a leading conjunction waw."""
    if len(c) > 2 and c[0] == "ו":
        c = c[1:]
    return norm_spelling(c)


def pointed_key(s):
    """Letters and vowel points, no cantillation or meteg."""
    import unicodedata
    keep = []
    for ch in unicodedata.normalize("NFD", s):
        o = ord(ch)
        if 0x05D0 <= o <= 0x05EA or 0x05B0 <= o <= 0x05BC or o in (0x05C1, 0x05C2, 0x05C7):
            keep.append(ch)
    return unicodedata.normalize("NFC", "".join(keep)).translate(str.maketrans("ךםןףץ", "כמנפצ"))


def compare(scroll_words, mt_words):
    """scroll_words: list of (cons, rec_all). mt_words: list of cons.

    Returns (status per scroll word, MT counterpart index per scroll word, missing MT indexes).
    """
    a = [norm_spelling(w[0]) for w in scroll_words]
    b = [norm_spelling(w) for w in mt_words]
    sm = SequenceMatcher(None, a, b, autojunk=False)
    status = [None] * len(scroll_words)
    counterpart = [None] * len(scroll_words)
    matched_mt = set()

    def settle(i, j):
        status[i] = "s" if scroll_words[i][0] == mt_words[j] else "o"
        counterpart[i] = j
        matched_mt.add(j)

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                settle(i1 + k, j1 + k)
            continue
        if tag == "insert":
            continue
        # replace or delete: first pair words that differ only by a conjunction waw or by spelling
        free_mt = list(range(j1, j2))
        for i in range(i1, i2):
            for j in free_mt:
                if core(scroll_words[i][0]) == core(mt_words[j]):
                    if norm_spelling(scroll_words[i][0]) == norm_spelling(mt_words[j]):
                        settle(i, j)
                    else:
                        status[i], counterpart[i] = "c", j  # differs only by "and"
                        matched_mt.add(j)
                    free_mt.remove(j)
                    break
        # then pair what is left in order; the rest are pluses
        rest_i = [i for i in range(i1, i2) if status[i] is None]
        for i, j in zip(rest_i, free_mt):
            status[i], counterpart[i] = "d", j
            matched_mt.add(j)
        for i in rest_i[len(free_mt):]:
            status[i] = "p"
    for i, w in enumerate(scroll_words):
        if w[1]:
            status[i] = "r"
            if counterpart[i] is not None:
                matched_mt.discard(counterpart[i])
    real = [counterpart[i] for i in range(len(status)) if status[i] in ("s", "o", "d", "c") and counterpart[i] is not None]
    missing = []
    if real:
        lo, hi = min(real), max(real)
        recon = {counterpart[i] for i in range(len(status)) if status[i] == "r" and counterpart[i] is not None}
        missing = [j for j in range(lo, hi + 1) if j not in matched_mt and j not in recon]
    return status, counterpart, missing


def main():
    ot = otype_ranges()
    w0, w1 = ot["word"]
    print("loading features")
    oslots = load_oslots()
    full = load_feature("full")
    glyph = load_feature("glyph")
    lex = load_feature("lex")
    book = load_feature("book")
    chapter = load_feature("chapter")
    verse = load_feature("verse")
    rec = load_feature("rec")
    scroll_f = load_feature("scroll")
    frag_f = load_feature("fragment")
    line_f = load_feature("line")
    after = load_feature("after")

    # map each slot to its line, fragment and scroll
    def owner_map(kind):
        a, b = ot[kind]
        starts = []
        for n in range(a, b + 1):
            s = oslots.get(n)
            if s:
                starts.append((s[0], s[1], n))
        starts.sort()
        return starts

    import bisect
    lines = owner_map("line")
    frags = owner_map("fragment")
    scrolls = owner_map("scroll")
    lstarts = [x[0] for x in lines]
    fstarts = [x[0] for x in frags]
    sstarts = [x[0] for x in scrolls]

    def find(starts_list, items, slot):
        i = bisect.bisect_right(starts_list, slot) - 1
        if i >= 0 and items[i][0] <= slot <= items[i][1]:
            return items[i][2]
        return None

    print("walking words")
    # Abegg's data splits prefixes and suffixes into separate word nodes; join them back into
    # written words: a written word ends where the transcription has a space.
    words = []  # (scroll, fragment, line, glyph, display, content lex, all_rec, some_rec, book, ch, vs)
    pending = []

    def flush():
        if not pending:
            return
        letters = [x for seg in pending for x in seg["letters"]]
        if letters:
            g = "".join(seg["g"] for seg in pending)
            lexes = [seg["lex"] for seg in pending if seg["lex"]]
            content = max(lexes, key=lambda x: len(heb_consonants(x))) if lexes else ""
            first = pending[0]
            words.append((first["sc"], first["fr"], first["ln"], g, g, content,
                          all(rec.get(x) == "1" for x in letters),
                          any(rec.get(x) == "1" for x in letters),
                          first["bk"], first["ch"], first["vs"]))
        pending.clear()

    prev_line = None
    for n in range(w0, w1 + 1):
        s = oslots.get(n)
        if not s:
            continue
        sl = s[0]
        ln = find(lstarts, lines, sl)
        if ln != prev_line:
            flush()
            prev_line = ln
        fr = find(fstarts, frags, sl)
        sc = find(sstarts, scrolls, sl)
        letters = [x for x in range(s[0], s[1] + 1) if re.match(r"[\u05d0-\u05ea]", glyph.get(x, ""))]
        g = "".join(glyph.get(x, "") for x in letters)
        pending.append({"sc": scroll_f.get(sc, "?"), "fr": frag_f.get(fr, "?"), "ln": line_f.get(ln, "?"),
                        "g": g, "lex": lex.get(n, ""), "letters": letters,
                        "bk": book.get(n), "ch": chapter.get(n), "vs": verse.get(n)})
        if after.get(s[1]) == " " or not letters:
            flush()
    flush()
    print("  words", len(words))

    # ---------------- biblical readings per verse
    vmap = read_json("idx/verses.json")["heb"]  # English osis -> Hebrew c.v when they differ
    heb_to_eng = {}
    for eng, hcv in vmap.items():
        bk, c, v = eng.split(".")
        hc, hv = hcv.split(".")
        heb_to_eng.setdefault(f"{bk}.{hc}.{hv}", f"{bk}.{c}.{v}")
    lemma_cons = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "heb_lemma_consonants.json"), encoding="utf-8"))
    lemma_pointed = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "heb_lemma_pointed.json"), encoding="utf-8"))

    groups = defaultdict(list)  # (osis_eng, scroll) -> words
    unknown_books = Counter()
    for w in words:
        if not w[8]:
            continue
        bk = DSS_BOOK.get(w[8])
        if not bk:
            unknown_books[w[8]] += 1
            continue
        hkey = f"{bk}.{w[9]}.{w[10]}"
        ekey = heb_to_eng.get(hkey, hkey)
        groups[(ekey, w[0])].append(w)
    print("  biblical verse-witness groups", len(groups), "unknown book labels", sum(unknown_books.values()))

    mt_cache = {}

    def mt_words(osis_key):
        bk, c, v = osis_key.split(".")
        if bk not in mt_cache:
            mt_cache[bk] = read_json(f"orig/{bk}.json")["v"]
        ent = mt_cache[bk].get(f"{c}:{v}")
        if not ent:
            return None
        # Masoretic words only: STEPBible "X" words are retroverted from the Septuagint and "R" words
        # are restored from parallel passages, so neither is compared with the scrolls
        return [(norm_cons(x[0]), x[2], x[3]) for x in ent["w"] if norm_cons(x[0]) and not x[6].startswith(("X", "R"))]

    def gloss_for(lexeme):
        pointed = lemma_pointed.get(pointed_key(lexeme))
        cands = pointed if pointed else lemma_cons.get(heb_consonants(lexeme), [])
        uniq = []
        for dk, g in cands:
            if g not in [u[1] for u in uniq]:
                uniq.append([dk, g])
        return uniq[:3]

    per_book = defaultdict(lambda: defaultdict(list))
    stats = Counter()
    for (ekey, sc), ws in groups.items():
        mt = mt_words(ekey)
        bk, c, v = ekey.split(".")
        sw = [(norm_cons(w[3]), w[6]) for w in ws]
        if mt is None:
            stats["verse_not_in_mt"] += 1
            continue
        status, cp, missing = compare([x for x in sw], [m[0] for m in mt])
        out_words = []
        for w, st, j in zip(ws, status, cp):
            item = [w[3], st or "p"]
            if st in ("d", "p") and not w[6]:
                item.append(gloss_for(w[5] or w[3]))
            else:
                item.append(None)
            item.append(j)
            if w[7] and not w[6]:
                item.append(1)  # partly reconstructed
            out_words.append(item)
        loc = []
        for w in ws:
            if (w[1], w[2]) not in loc:
                loc.append((w[1], w[2]))
        rec = {"s": sc, "loc": [f"{f}:{l}" for f, l in loc][:6], "w": out_words,
               "m": [[j, mt[j][1]] for j in missing]}
        per_book[bk][f"{c}:{v}"].append(rec)
        for st in status:
            stats[st] += 1
    for bk, d in per_book.items():
        write_json(f"dss/bib/{bk}.json", {"b": bk, "v": d})
    print("  status counts", dict(stats))

    # ---------------- scroll list and non-biblical texts
    by_scroll = defaultdict(list)
    for w in words:
        by_scroll[w[0]].append(w)
    scroll_list = []
    total = 0
    for sc, ws in by_scroll.items():
        bib = sum(1 for w in ws if w[8])
        scroll_list.append([sc, len(ws), bib])
        if bib > len(ws) * 0.5:
            continue
        lines_out = []
        cur = None
        for w in ws:
            key = (w[1], w[2])
            if key != cur:
                lines_out.append([w[1], w[2], []])
                cur = key
            lines_out[-1][2].append([w[3], 1 if w[6] else (2 if w[7] else 0)])
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", sc)
        total += write_json(f"dss/text/{safe}.json", {"s": sc, "lines": lines_out})
    scroll_list.sort()
    write_json("dss/scrolls.json", scroll_list)
    print("  non-biblical text bytes", total)

    # ---------------- lexeme index
    lexidx = defaultdict(lambda: {"n": 0, "b": 0, "at": []})
    for w in words:
        if not w[5] or w[6]:
            continue
        c = heb_consonants(w[5])
        if not c:
            continue
        e = lexidx[c]
        e["n"] += 1
        if w[8]:
            e["b"] += 1
        elif len(e["at"]) < 60:
            e["at"].append(f"{w[0]} {w[1]}:{w[2]}")
    blocks = defaultdict(dict)
    for c, e in lexidx.items():
        blocks[c[0]][c] = [e["n"], e["b"], e["at"]]
    for k, d in blocks.items():
        write_json(f"dss/lex/{ord(k):x}.json", d)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_dss.json"), "w", encoding="utf-8") as f:
        json.dump({"stats": dict(stats), "unknown_books": dict(unknown_books), "scrolls": len(scroll_list)}, f, indent=1)


if __name__ == "__main__":
    main()
