#!/usr/bin/env python3
"""Fixtures for the self-test page, read straight from the upstream files.

This script shares no parsing code with the other build scripts. It only borrows the book table from
common.py. The self-test compares what the app shows against this independent reading of the sources.

  data/meta/fixtures.json
    counts    verses per book in each upstream file (BSB, WEB, KJV, TAHOT, TAGNT)
    sample    300 verses drawn at random (fixed seed) with their upstream text
    psalms    English, Hebrew and Greek (Septuagint) Psalm numbering from STEPBible TVTMS
    dss       scroll, fragment or column, and lines for the five required scroll variants (Text-Fabric)
    editions  TAGNT editions for Acts 8:37 and Mark 16:9-20

Run: THREADS_SRC=../srcdata python3 -I build/build_fixtures.py
"""
import csv
import glob
import os
import random
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BOOKS, BY_OSIS, BY_STEP, BY_USFM, SWORD_NAMES, SRC, write_json  # book table and writer only

STEP_DIR = os.path.join(SRC, "stepbible/Translators Amalgamated OT+NT")
EDITIONS = ["NA28", "NA27", "Tyn", "SBL", "WH", "Treg", "TR", "Byz"]
TAGS = re.compile(r"<[^>]+>")
SBL_SIGNS = re.compile("[⸀-⸏⸜⸝]")


def squeeze(s):
    return re.sub(r"\s+", " ", s.replace(" ", " ")).strip()


# ---------------------------------------------------------------- English Bibles
def read_kjv():
    """{(osis_book, c, v): text} from the OSIS file, notes and titles removed."""
    s = open(os.path.join(SRC, "openbibles/eng-kjv.osis.xml"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'<verse\b[^>]*\bsID="([^"]+)"[^>]*/>', s):
        sid = m.group(1)
        end = s.find(f'<verse eID="{sid}"', m.end())
        if end < 0:
            continue
        body = s[m.end():end]
        body = re.sub(r"<note\b.*?</note>", "", body, flags=re.S)
        body = re.sub(r"<title\b.*?</title>", "", body, flags=re.S)
        bk, c, v = sid.split(".")[:3]
        out[(bk, int(c), int(v))] = squeeze(TAGS.sub("", body))
    return out


def read_web():
    """{(osis_book, c, v): text} from the USFX file, footnotes and cross references removed."""
    s = open(os.path.join(SRC, "openbibles/eng-web.usfx.xml"), encoding="utf-8").read()
    out = {}
    for bm in re.finditer(r'<book id="([0-9A-Z]{3})">(.*?)</book>', s, flags=re.S):
        if bm.group(1) not in BY_USFM:
            continue
        osis = BY_USFM[bm.group(1)][1]
        body = bm.group(2)
        c = 0
        for m in re.finditer(r'<c id="(\d+)"\s*/>|<v id="(\d+)"[^>]*/>(.*?)<ve\s*/>', body, flags=re.S):
            if m.group(1):
                c = int(m.group(1))
                continue
            t = re.sub(r"<f\b.*?</f>", "", m.group(3), flags=re.S)
            t = re.sub(r"<x\b.*?</x>", "", t, flags=re.S)
            out[(osis, c, int(m.group(2)))] = squeeze(TAGS.sub("", t))
    return out


def read_bsb():
    """{(osis_book, c, v): text} from the scrollmapper copy of the published BSB."""
    out = {}
    names = {b[2]: b[1] for b in BOOKS}
    names.update(SWORD_NAMES)
    names.update({"Psalms": "Ps", "Revelation of John": "Rev"})
    with open(os.path.join(SRC, "openbible/formats/csv/BSB.csv"), encoding="utf-8", newline="") as f:
        r = csv.reader(f)
        next(r)
        for book, c, v, text in r:
            osis = names.get(book)
            if osis is None:
                raise SystemExit(f"unknown BSB book name {book!r}")
            out[(osis, int(c), int(v))] = text.strip()
    return out


# ---------------------------------------------------------------- STEPBible
STEP_REF = re.compile(r"^([0-9A-Za-z]+)\.(\d+)\.(\d+)([^#]*)#(\d+)=(\S+)$")


def step_rows(prefix):
    for path in sorted(glob.glob(os.path.join(STEP_DIR, prefix + "*.txt"))):
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                cols = line.rstrip("\n").split("\t")
                m = STEP_REF.match(cols[0])
                if m:
                    yield m, cols


def read_tahot():
    """Hebrew words per English verse (the reference before any bracket), in file order."""
    out = defaultdict(list)
    for m, cols in step_rows("TAHOT"):
        book, c, v = m.group(1), int(m.group(2)), int(m.group(3))
        out[(BY_STEP[book][1], c, v)].append(cols[1].replace("/", "").replace("\\", ""))
    return out


def read_tagnt():
    """Per verse (KJV numbering): words with type, editions and Greek; plus NA refs that KJV numbers otherwise."""
    out = defaultdict(list)
    moved = set()
    for m, cols in step_rows("TAGNT"):
        book, c, v, brackets, wtype = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), m.group(6)
        osis = BY_STEP[book][1]
        kjv = re.search(r"\[(\d+)\.(\d+)\]", brackets)
        key = (osis, int(kjv.group(1)), int(kjv.group(2))) if kjv else (osis, c, v)
        if kjv:
            moved.add((osis, c, v))
            moved.add(key)
        eds = cols[5].split("+") if len(cols) > 5 else []
        out[key].append({"type": wtype, "eds": [e for e in EDITIONS if e in eds], "greek": cols[1].split(" (")[0]})
    return out, moved


def read_sblgnt():
    out = {}
    for path in glob.glob(os.path.join(SRC, "sblgnt/data/sblgnt/text/*.txt")):
        with open(path, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^(\S+) (\d+):(\d+)\t(.*)$", line.rstrip("\n"))
                if m and m.group(1) in BY_OSIS:
                    out[(m.group(1), int(m.group(2)), int(m.group(3)))] = m.group(4)
    return out


# ---------------------------------------------------------------- TVTMS Psalms
def read_tvtms_psalms():
    path = glob.glob(os.path.join(SRC, "stepbible/Versification/TVTMS*.txt"))[0]
    lines = open(path, encoding="utf-8-sig").read().split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("#DataStart(Condensed)"))
    cols = None
    rows = []
    for l in lines[start + 1:]:
        if l.startswith("#DataEnd"):
            break
        f = l.split("\t")
        if f[0].startswith("$"):
            cols = None
            continue
        if f[0] == "BIBLES":
            cols = [x.strip() for x in f[1:] if x.strip()]
            continue
        if cols and f[0] in ("OneToOne", "SubdividedVerse", "MergedPrevVerse", "MergedNextVerse") and f[1].startswith("Psa."):
            rows.append((f[0], dict(zip(cols, [x.strip() for x in f[1:1 + len(cols)]]))))
    return rows


def expand(cell):
    """'Psa.9:22-39' -> [(9, 22) ... (9, 39)]; 'Psa.11:Title' -> [(11, 0)]; Absent or NoVerse -> None."""
    if not cell or cell.startswith("Absent") or cell.startswith("NoVerse"):
        return None
    m = re.match(r"^Psa\.(\d+):(Title|\d+)(?:-(?:(\d+):)?(\d+))?$", cell)
    if not m:
        return None
    c = int(m.group(1))
    v1 = 0 if m.group(2) == "Title" else int(m.group(2))
    if not m.group(4):
        return [(c, v1)]
    c2 = int(m.group(3)) if m.group(3) else c
    if c2 != c:
        return None
    return [(c, v) for v in range(v1, int(m.group(4)) + 1)]


def psalm_map():
    out = []
    complex_rows = 0
    for kind, r in read_tvtms_psalms():
        eng, heb, grk = expand(r.get("English KJV", "")), expand(r.get("Hebrew", "")), expand(r.get("Greek", ""))
        if kind != "OneToOne" or not eng or not heb or not grk or not (len(eng) == len(heb) == len(grk)):
            complex_rows += 1
            continue
        for e, hh, g in zip(eng, heb, grk):
            if e[1] == 0:
                continue
            out.append([f"{e[0]}:{e[1]}", f"{hh[0]}:{hh[1]}", f"{g[0]}:{g[1]}"])
    return out, complex_rows


# ---------------------------------------------------------------- Dead Sea Scrolls (Text-Fabric)
TF = os.path.join(SRC, "dss/tf/2.0.4")


def tf_feature(name, want=None):
    """Parse a Text-Fabric node feature: {node: value}. want(node) can limit what is kept."""
    out = {}
    node = 0
    with open(os.path.join(TF, name + ".tf"), encoding="utf-8") as f:
        body = False
        for line in f:
            line = line.rstrip("\n")
            if not body:
                if line == "":
                    body = True
                continue
            if "\t" in line:
                spec, val = line.split("\t", 1)
            else:
                spec, val = "", line
            if spec:
                if "-" in spec:
                    a, b = map(int, spec.split("-"))
                else:
                    a = b = int(spec)
            else:
                a = b = node + 1
            for n in range(a, b + 1):
                if want is None or want(n):
                    out[n] = val
            node = b
    return out


def tf_types():
    ranges = {}
    with open(os.path.join(TF, "otype.tf"), encoding="utf-8") as f:
        body = False
        for line in f:
            line = line.rstrip("\n")
            if not body:
                body = line == ""
                continue
            spec, t = line.split("\t")
            a, b = map(int, spec.split("-")) if "-" in spec else (int(spec), int(spec))
            ranges[t] = (a, b)
    return ranges


def tf_oslots(first_node, keep):
    """{node: first slot} for nodes where keep(node) holds. oslots starts at the first non-slot node."""
    out = {}
    node = first_node - 1
    with open(os.path.join(TF, "oslots.tf"), encoding="utf-8") as f:
        body = False
        for line in f:
            line = line.rstrip("\n")
            if not body:
                body = line == ""
                continue
            if "\t" in line:
                spec, val = line.split("\t", 1)
                node = int(spec)
            else:
                val = line
                node += 1
            if keep(node):
                out[node] = [tuple(map(int, p.split("-"))) if "-" in p else (int(p), int(p)) for p in val.split(",")]
    return out


VARIANTS = [
    # label, scroll id in the data, siglum, TF book code, OSIS ref list
    ("Deut 32:8", "4Q37", "4QDeut-j", "Deut", [(32, 8)]),
    ("1 Sam 10:27 to 11:1", "4Q51", "4QSam-a", "1Sam", [(10, 27), (11, 1)]),
    ("Ps 145:13", "11Q5", "11QPs-a", "Ps", [(145, 13)]),
    ("Isa 53:11 (1QIsa-a)", "1Qisaa", "1QIsa-a", "Is", [(53, 11)]),
    ("Isa 53:11 (1QIsa-b)", "1Q8", "1QIsa-b", "Is", [(53, 11)]),
    ("Jer 10 (shorter text)", "4Q71", "4QJer-b", "Jer", [(10, v) for v in range(1, 26)]),
]


def dss_locations():
    types = tf_types()
    w0, w1 = types["word"]
    l0, l1 = types["line"]
    slot_max = types["sign"][1]
    is_word = lambda n: w0 <= n <= w1
    is_line = lambda n: l0 <= n <= l1
    book = tf_feature("book", is_word)
    chapter = tf_feature("chapter", is_word)
    verse = tf_feature("verse", is_word)
    scroll_of_line = tf_feature("scroll", is_line)
    frag_of_line = tf_feature("fragment", is_line)
    line_no = tf_feature("line", is_line)
    wanted = {}
    for label, sid, sig, bk, refs in VARIANTS:
        for c, v in refs:
            wanted[(bk, str(c), str(v))] = True
    words = [n for n, b in book.items() if (b, chapter.get(n), verse.get(n)) in wanted]
    set_words = set(words)
    slots = tf_oslots(slot_max + 1, lambda n: is_line(n) or n in set_words)
    # slot -> line node
    slot_line = {}
    for n in range(l0, l1 + 1):
        for a, b in slots.get(n, []):
            for s in range(a, b + 1):
                slot_line[s] = n
    out = []
    for label, sid, sig, bk, refs in VARIANTS:
        locs = defaultdict(set)
        for n in words:
            ln = slot_line.get(slots[n][0][0])
            if ln is None or scroll_of_line.get(ln) != sid or book[n] != bk:
                continue
            locs[f"{chapter[n]}:{verse[n]}"].add((frag_of_line.get(ln), int(line_no.get(ln, "0") or 0)))
        out.append({"label": label, "scroll": sid, "siglum": sig, "book": bk,
                    "verses": {k: sorted([f"{f}:{l}" for f, l in v], key=lambda x: (x.split(":")[0], int(x.split(":")[1])))
                               for k, v in sorted(locs.items(), key=lambda kv: tuple(map(int, kv[0].split(":"))))}})
    return out


# ---------------------------------------------------------------- main
def main():
    print("reading upstream files")
    kjv, web, bsb = read_kjv(), read_web(), read_bsb()
    tahot = read_tahot()
    tagnt, moved = read_tagnt()
    sbl = read_sblgnt()

    counts = {b[1]: {"bsb": 0, "web": 0, "kjv": 0, "orig": 0} for b in BOOKS}
    for name, src in (("bsb", bsb), ("web", web), ("kjv", kjv)):
        for (bk, c, v), t in src.items():
            if bk in counts and v > 0 and t:
                counts[bk][name] += 1
    for (bk, c, v) in tahot:
        counts[bk]["orig"] += 1
    for (bk, c, v) in tagnt:
        counts[bk]["orig"] += 1

    rng = random.Random(20261108)
    pool = sorted(k for k, t in bsb.items() if t and k[2] > 0)
    order = {b[1]: b[0] for b in BOOKS}
    pick = sorted(rng.sample(pool, 300), key=lambda k: (order[k[0]], k[1], k[2]))
    sample = []
    for k in pick:
        bk, c, v = k
        e = {"v": f"{bk}.{c}.{v}", "bsb": bsb[k]}
        if web.get(k):
            e["web"] = web[k]
        if kjv.get(k):
            e["kjv"] = kjv[k]
        if order[bk] < 40:
            if tahot.get(k):
                e["heb"] = " ".join(tahot[k])
        elif k in sbl and k not in moved:
            e["grk"] = squeeze(SBL_SIGNS.sub("", sbl[k]))
        sample.append(e)

    psalms, complex_rows = psalm_map()

    editions = {}
    for k in [("Acts", 8, 37)] + [("Mark", 16, v) for v in range(9, 21)]:
        ws = tagnt.get(k, [])
        inter = [e for e in EDITIONS if all(e in w["eds"] for w in ws)] if ws else []
        union = [e for e in EDITIONS if any(e in w["eds"] for w in ws)]
        editions[f"{k[0]}.{k[1]}.{k[2]}"] = {
            "words": len(ws), "types": sorted({w["type"] for w in ws}), "all": inter, "any": union,
            "double_brackets": any("[[" in w["greek"] or "]]" in w["greek"] for w in ws)}

    dss = dss_locations()

    n = write_json("meta/fixtures.json", {
        "_about": "Read from the upstream files by build/build_fixtures.py, independently of the other build scripts.",
        "counts": counts, "sample": sample, "psalms": psalms, "psalms_not_one_to_one": complex_rows,
        "dss": dss, "editions": editions})
    print("fixtures bytes", n)
    tot = {k: sum(c[k] for c in counts.values()) for k in ("bsb", "web", "kjv", "orig")}
    print("totals", tot, "psalm rows", len(psalms), "complex", complex_rows)
    for d in dss:
        print(d["label"], d["scroll"], d["verses"] if len(d["verses"]) < 4 else list(d["verses"].items())[:6])
    print({k: (v["all"], v["double_brackets"]) for k, v in list(editions.items())[:2]})


if __name__ == "__main__":
    main()
