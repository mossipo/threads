#!/usr/bin/env python3
"""Septuagint, topical indexes and Ante-Nicene Fathers references.

  data/lxx/<Book>.json      [Swete Greek, Brenton English, LXX reference when it differs] per English verse
  data/topics/topics.json   every Nave and Torrey topic
  data/topics/e/<n>.json    entries with their references (sharded)
  data/topics/words.json    word -> topic ids (titles) for the claim search
  data/anf/idx/<Book>.json  references to each verse found in the Fathers' own text
  data/anf/p/<vol>.json     the paragraphs those references sit in
"""
import csv
import hashlib
import html
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BOOKS, BY_OSIS, BY_STEP, BY_NAME, SRC, vid, vid_parts, write_json, parse_osis


# ------------------------------------------------------------------ Septuagint
def build_lxx():
    own = {}
    with open(os.path.join(SRC, "lxx/swete-greek.tsv"), encoding="utf-8") as f:
        r = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        next(r)
        for row in r:
            book, c, v, text = row[:4]
            own.setdefault(text.strip(), f"{c}:{v}")
    per_book = defaultdict(dict)
    with open(os.path.join(SRC, "lxx/swete-greek-english-grid.tsv"), encoding="utf-8") as f:
        r = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        next(r)
        for row in r:
            _, book, c, v, greek, brenton = row[:6]
            if book not in BY_STEP:
                continue
            osis = BY_STEP[book][1]
            rec = [greek.strip(), brenton.strip()]
            lxx_ref = own.get(greek.strip())
            if lxx_ref and lxx_ref != f"{c}:{v}":
                rec.append(lxx_ref)
            per_book[osis][f"{c}:{v}"] = rec
    n = 0
    for osis, d in per_book.items():
        n += write_json(f"lxx/{osis}.json", {"b": osis, "v": d})
    print("lxx bytes", n)


# ------------------------------------------------------------------ topical indexes
STOP = set("""a an the and or of to in on for with by from as at is are was were be been it its this that these those
his her their our your my he she they we you i not no but if then than so such which who whom what when where how all
any each every other some see also""".split())


def topical_book(name):
    n = name.lower()
    alias = {"psalm": "psalms", "song of solomon": "song of songs", "canticles": "song of songs"}
    return BY_NAME.get(n) or BY_NAME.get(alias.get(n, n))


def shard_of(tid):
    """Same function as topicShard() in app/data.js."""
    h = 0
    for ch in tid:
        h = (h * 31 + ord(ch)) % 1000003
    return h % 64


def build_topics():
    topics = []
    entries = defaultdict(list)  # topic id -> entries
    for src in ("nave", "torrey"):
        with open(os.path.join(SRC, f"topical/dist/{src}/topics.jsonl"), encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                topics.append([d["id"], src, d["sourceTopic"], d.get("entryCount", 0), d.get("seeAlso", [])])
    refs = defaultdict(list)
    for src in ("nave", "torrey"):
        with open(os.path.join(SRC, f"topical/dist/{src}/assertions.jsonl"), encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                b = topical_book(d["book"])
                if not b:
                    continue
                vs = d.get("verseStart")
                ve = d.get("verseEnd") or vs
                ce = d.get("chapterEnd") or d["chapterStart"]
                if vs is None:  # whole chapter
                    a, z = vid(b[0], d["chapterStart"], 1), vid(b[0], ce, 999)
                else:
                    a, z = vid(b[0], d["chapterStart"], vs), vid(b[0], ce, ve)
                refs[d["entryId"]].append([a, z])
    for src in ("nave", "torrey"):
        with open(os.path.join(SRC, f"topical/dist/{src}/entries.jsonl"), encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                text = re.sub(r"\s*" + chr(0x2014) + r"\s*", ": ", d["rawText"])  # Torrey's dashes become colons
                entries[d["topicId"]].append([d["id"], text, refs.get(d["id"], [])])
    shards = defaultdict(dict)
    for tid, es in entries.items():
        shards[shard_of(tid)][tid] = es
    n = 0
    for k, d in shards.items():
        n += write_json(f"topics/e/{k}.json", d)
    words = defaultdict(set)
    for tid, src, title, cnt, see in topics:
        for w in re.findall(r"[a-z]+", title.lower()):
            if w not in STOP and len(w) > 2:
                words[w].add(tid)
    # also index the words of each entry line, so sub-topics are found ("Holy Spirit > outpoured")
    ewords = defaultdict(set)
    for tid, es in entries.items():
        for eid, text, rs in es:
            for w in set(re.findall(r"[a-z]+", text.lower())):
                if w not in STOP and len(w) > 2:
                    ewords[w].add(tid)
    write_json("topics/topics.json", topics)
    write_json("topics/words.json", {"title": {w: sorted(t) for w, t in words.items()},
                                     "entry": {w: sorted(t)[:400] for w, t in ewords.items()}})
    print("topics", len(topics), "entry bytes", n)


# ------------------------------------------------------------------ Ante-Nicene Fathers
SKIP_DIV = re.compile(r"^(Title Page|Preface|Introductory|Introduction|Elucidation|Translator|Note|Index|Contents|Appendix)", re.I)


def no_dash(t):
    """Non-Bible source text: em dashes shown as spaced hyphens (see sources.json)."""
    return re.sub(r"\s*\u2014\s*", " - ", t)


def build_anf():
    base = os.path.join(SRC, "anf/sources/xml")
    idx = defaultdict(lambda: defaultdict(list))
    paras_total = 0
    count = 0
    for fn in sorted(os.listdir(base)):
        if not fn.endswith(".xml"):
            continue
        vol = fn[3:5]
        s = open(os.path.join(base, fn), encoding="utf-8", errors="replace").read()
        # Walk the file in order. A reference inside an editor's note belongs to the main paragraph
        # the note is anchored in; paragraphs inside notes are never treated as main text.
        divs = [(m.start(), int(m.group(1)), html.unescape(m.group(3)))
                for m in re.finditer(r'<div([1-4])\b[^>]*\bid="([^"]+)"[^>]*\btitle="([^"]*)"', s)]
        paras = {}
        di = 0
        stack = {}
        depth = 0
        main = None
        for m in re.finditer(r"<(/?)(p|note|scripRef)\b([^>]*?)(/?)>", s):
            closing, tag, attrs, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
            while di < len(divs) and divs[di][0] < m.start():
                _, lvl, title = divs[di]
                stack[lvl] = title
                for k in list(stack):
                    if k > lvl:
                        del stack[k]
                di += 1
            if tag == "note":
                if selfclose:
                    continue
                if not closing and depth == 0 and main is not None:
                    main["at"] = m.start()  # references in this note point here
                depth += -1 if closing else 1
                continue
            if tag == "p" and depth == 0:
                if not closing:
                    idm = re.search(r'\bid="([^"]+)"', attrs)
                    main = {"id": idm.group(1) if idm else None, "start": m.end(), "refs": [],
                            "titles": [stack[k] for k in sorted(stack)]}
                elif main:
                    titles = main["titles"]
                    if main["refs"] and main["id"] and titles and not any(SKIP_DIV.match(t) for t in titles[1:]):
                        body = re.sub(r"<note\b.*?</note>", "", s[main["start"]:m.start()], flags=re.S)
                        text = no_dash(re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", body))).strip())
                        if len(text) >= 40:
                            pid = main["id"]
                            paras[pid] = [text[:6000], no_dash(titles[0]),
                                          no_dash(titles[1]) if len(titles) > 1 else "",
                                          no_dash(titles[-1]) if len(titles) > 2 else ""]
                            for ref, at in main["refs"]:
                                pre = re.sub(r"<note\b.*?</note>", "", s[main["start"]:at], flags=re.S)
                                off = len(re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", pre))).lstrip())
                                for piece in ref.split(" "):
                                    a = parse_osis(piece.split("-")[0])
                                    if a is None:
                                        continue
                                    b, c, v = vid_parts(a)
                                    lst = idx[BOOKS[b - 1][1]][f"{c}:{v}"]
                                    if not any(x[0] == vol and x[1] == pid for x in lst):
                                        lst.append([vol, pid, min(off, 6000)])
                                        count += 1
                    main = None
                continue
            if tag == "scripRef" and not closing and main is not None:
                om = re.search(r'osisRef="Bible:([^"]+)"', attrs)
                if om:
                    main["refs"].append((om.group(1), main.get("at", m.start()) if depth > 0 else m.start()))
        paras_total += write_json(f"anf/p/{vol}.json", paras)
    for osis, d in idx.items():
        write_json(f"anf/idx/{osis}.json", d)
    print("anf references", count, "paragraph bytes", paras_total)


if __name__ == "__main__":
    build_lxx()
    build_topics()
    build_anf()
