#!/usr/bin/env python3
"""Cross-reference graph with deterministic link scores.

Evidence per link (all from named data, never from AI):
  Q  quotation: longest run of identical words shared by a New Testament verse (SBLGNT) and an
     Old Testament verse in the Septuagint (Swete). 10 points per word in the run, max 60.
     Only counted when the run has 3 or more words and at least 2 of them are not common function words.
  L  shared lemmas: for each lemma both passages share, its rarity weight (inverse document
     frequency, natural log) is added; 2.5 points per unit of weight, max 40. Hebrew lemmas
     (STEPBible dStrong roots) compare Old Testament verses; Greek lemmas compare New Testament
     verses; an Old Testament verse is compared with a New Testament verse through the Greek
     words that render its Hebrew in the Septuagint (MACULA Hebrew alignment).
     Lemmas used in more than 1,500 verses are ignored as too common to carry weight.
  V  OpenBible.info votes: round(10 x log10(1 + votes)), max 30; zero or negative votes give 0.
  T  Treasury of Scripture Knowledge: 15 points when the TSK lists the link (either direction).
  Score = Q + L + V + T.

Link type (first rule that matches):
  direct quotation   New Testament verse shares 4 or more consecutive Septuagint words (2+ content words)
  clear allusion     New Testament verse shares a 3-word Septuagint run, or 3+ key lemmas (weight 3.5+,
                     summing to 15+) together with V >= 10 or a TSK listing
  typology           both passages are listed in one typology entry of Nave's or Torrey's
  shared key lemma   at least one key lemma (weight 3.5 or more) shared
  thematic echo      any other link from OpenBible or the TSK
"""
import csv
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (BOOKS, BY_OSIS, BY_STEP, BY_USFM, BY_NAME, BY_INDEX, SRC, DATA, NT_START, SWORD_NAMES,
                    vid, vid_parts, parse_osis, write_json, norm_greek, read_json)

MAX_DF = 1500
KEY_WEIGHT = 3.5  # a "key" lemma appears in about 1 verse in 33 or fewer
REPORT = Counter()
EXAMPLES = defaultdict(list)


def ex(kind, msg):
    REPORT[kind] += 1
    if len(EXAMPLES[kind]) < 40:
        EXAMPLES[kind].append(msg)


def plain(s):
    m = re.match(r"([HG])0*(\d+)", s or "")
    return f"{m.group(1)}{int(m.group(2))}" if m else None


# ------------------------------------------------------------------ verse data
def load_orig():
    """lemmas per verse, Hebrew to English verse map, SBLGNT text per NT verse."""
    lem = {}
    heb2eng = {}
    sbl = {}
    for bi, osis, *_ in BOOKS:
        d = read_json(f"orig/{osis}.json")["v"]
        for key, ent in d.items():
            c, v = map(int, key.split(":"))
            k = vid(bi, c, v)
            s = set()
            for w in ent["w"]:
                if bi >= NT_START and not re.search(r"[NK]", w[6]):
                    continue  # only words of the NA text or the TR
                if bi < NT_START and w[6].startswith(("X", "R")):
                    continue  # not in the Leningrad Codex
                p = plain(w[3])
                if p and not (p.startswith("H") and int(p[1:]) >= 9000):
                    s.add(p)
            if v != 0:
                lem[k] = s
            if bi < NT_START:
                if "h" in ent:
                    hc, hv = map(int, ent["h"].split("."))
                    heb2eng.setdefault(vid(bi, hc, hv), vid(bi, c, v) if v else vid(bi, c, 1))
                else:
                    heb2eng.setdefault(k, k)
            if "g" in ent:
                sbl[k] = ent["g"]
    return lem, heb2eng, sbl


def load_macula(heb2eng):
    """Septuagint Greek equivalents per English OT verse, and Hebrew->Greek lemma counts."""
    per_verse = defaultdict(set)
    h2g = defaultdict(Counter)
    path = os.path.join(SRC, "macula_hebrew/WLC/tsv/macula-hebrew.tsv")
    with open(path, encoding="utf-8") as f:
        r = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        hdr = next(r)
        i_ref, i_sn, i_g = hdr.index("ref"), hdr.index("strongnumberx"), hdr.index("greekstrong")
        for row in r:
            if len(row) <= i_g:
                continue
            m = re.match(r"^([1-3]?[A-Z]{2,3}) (\d+):(\d+)", row[i_ref])
            if not m or m.group(1) not in BY_USFM:
                continue
            hv = vid(BY_USFM[m.group(1)][0], int(m.group(2)), int(m.group(3)))
            ev = heb2eng.get(hv)
            if ev is None:
                REPORT["macula_unmapped_verse_words"] += 1
                continue
            gs = [g for g in re.findall(r"\d+", row[i_g])]
            hn = re.match(r"0*(\d+)", row[i_sn] or "")
            for g in gs:
                per_verse[ev].add(f"G{int(g)}")
                if hn:
                    h2g[f"H{int(hn.group(1))}"][f"G{int(g)}"] += 1
    return per_verse, h2g


def load_lxx():
    words = {}
    path = os.path.join(SRC, "lxx/swete-greek-english-grid.tsv")
    with open(path, encoding="utf-8") as f:
        r = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
        next(r)
        for row in r:
            _, book, c, v, greek, brenton = row[:6]
            if book not in BY_STEP or not greek.strip():
                continue
            words[vid(BY_STEP[book][0], int(c), int(v))] = [norm_greek(x) for x in greek.split() if norm_greek(x)]
    return words


# ------------------------------------------------------------------ quotation detection
def runs(a, b):
    """All maximal common runs between token lists a and b (simple DP on a few dozen words)."""
    best = []
    n, m = len(a), len(b)
    prev = [0] * (m + 1)
    for i in range(1, n + 1):
        cur = [0] * (m + 1)
        ai = a[i - 1]
        for j in range(1, m + 1):
            if ai == b[j - 1]:
                cur[j] = prev[j - 1] + 1
        for j in range(1, m + 1):
            L = cur[j]
            if L >= 3 and (i == n or j == m or a[i] != b[j]):
                best.append((L, i - L, j - L))
        prev = cur
    return best


def detect_quotations(nt_words, lxx_words, stop):
    tri = defaultdict(set)
    for k, ws in lxx_words.items():
        for i in range(len(ws) - 2):
            g = tuple(ws[i:i + 3])
            if sum(1 for x in g if x not in stop) >= 2:
                tri[g].add(k)
    found = {}
    for nk, ws in nt_words.items():
        cands = set()
        for i in range(len(ws) - 2):
            g = tuple(ws[i:i + 3])
            if g in tri and len(tri[g]) <= 40:
                cands |= tri[g]
        for ok in cands:
            rs = runs(ws, lxx_words[ok])
            if not rs:
                continue
            L, ia, _ = max(rs)
            run_words = ws[ia:ia + L]
            content = sum(1 for x in run_words if x not in stop)
            if content < 2:
                continue
            total = sum(r[0] for r in rs)
            found[(nk, ok)] = (L, content, total, " ".join(run_words))
    return found


# ------------------------------------------------------------------ links from datasets
def range_of(ref):
    parts = ref.split("-")
    a = parse_osis(parts[0])
    if a is None:
        return None
    b = parse_osis(parts[1]) if len(parts) > 1 else a
    if b is None or b < a:
        b = a
    return a, b


def load_openbible():
    out = {}
    path = os.path.join(SRC, "openbible/sources/extras/cross_references.txt")
    with open(path, encoding="utf-8") as f:
        next(f)
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 3:
                continue
            a = range_of(p[0])
            b = range_of(p[1])
            if not a or not b:
                ex("openbible_unparsed", line.strip())
                continue
            try:
                votes = int(p[2])
            except ValueError:
                votes = 0
            out[(a[0], b)] = votes
    return out


def load_tsk():
    out = set()
    path = os.path.join(SRC, "tsk/data/tsk.ndjson")
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            if d.get("type") != "verse":
                continue
            bn = d["bookName"]
            b = BY_OSIS.get(SWORD_NAMES.get(bn, "")) or BY_NAME.get(bn.lower()) or BY_NAME.get({"song of solomon": "song of songs"}.get(bn.lower(), bn.lower()))
            if not b:
                ex("tsk_unknown_book", d["bookName"])
                continue
            src = vid(b[0], d["chapterNumber"], d["verseNumber"])
            for sec in d.get("sections", []):
                for c in sec.get("content", []):
                    if c.get("type") == "reference" and c.get("osisRef"):
                        for piece in c["osisRef"].split(" "):
                            if piece.startswith("strong:") or re.match(r"^[1-4]?(Macc|Esd|Tob|Jdt|Sir|Wis|Bar|PrMan|AddEsth|EpJer|SgThree|Sus|Bel)\.", piece):
                                continue
                            r = range_of(piece)
                            if r:
                                out.add((src, r))
                            else:
                                ex("tsk_unparsed", piece)
    return out


TOPIC_BOOK = {}


def topical_book(name):
    n = name.lower()
    if n in BY_NAME:
        return BY_NAME[n]
    alias = {"psalm": "psalms", "song of solomon": "song of songs", "canticles": "song of songs"}
    return BY_NAME.get(alias.get(n, n))


def load_typology():
    """Pairs of passages listed together in one typology entry of Nave's or Torrey's."""
    entries = {}
    for src in ("nave", "torrey"):
        with open(os.path.join(SRC, f"topical/dist/{src}/entries.jsonl"), encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                if re.search(r"\btyp(e|es|ical)\b", d["rawText"], re.I) and not re.search(r"\bsee types\b", d["rawText"], re.I):
                    entries[d["id"]] = (d["sourceTopic"], d["rawText"])
    refs = defaultdict(list)
    for src in ("nave", "torrey"):
        with open(os.path.join(SRC, f"topical/dist/{src}/assertions.jsonl"), encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                if d["entryId"] not in entries or d.get("scope") not in ("verse", "chapter", None):
                    continue
                b = topical_book(d["book"])
                if not b:
                    continue
                vs = d.get("verseStart") or 1
                ve = d.get("verseEnd") or vs
                a = vid(b[0], d["chapterStart"], vs)
                z = vid(b[0], d.get("chapterEnd") or d["chapterStart"], ve)
                refs[d["entryId"]].append((a, max(a, z)))
    pairs = {}
    for eid, rs in refs.items():
        for i in range(len(rs)):
            for j in range(len(rs)):
                if i != j and rs[i] != rs[j]:
                    pairs[(rs[i][0], rs[j])] = eid
    return pairs, entries


# ------------------------------------------------------------------ main
def main():
    print("loading verse data")
    lem, heb2eng, sbl = load_orig()
    lxx_eq, h2g = load_macula(heb2eng)
    lxx_words = load_lxx()
    nt_words = {k: [norm_greek(x) for x in re.sub(r"[⟦⟧]", "", t).split() if norm_greek(x)] for k, t in sbl.items()}
    print("  verses", len(lem), "lxx eq verses", len(lxx_eq), "lxx verses", len(lxx_words), "nt verses", len(nt_words))

    # lemma document frequencies
    df_h, df_g = Counter(), Counter()
    for k, s in lem.items():
        for p in s:
            (df_h if p.startswith("H") else df_g)[p] += 1
    for k, s in lxx_eq.items():
        for p in s:
            df_g[p] += 1
    n_h = sum(1 for k in lem if vid_parts(k)[0] < NT_START)
    n_g = sum(1 for k in lem if vid_parts(k)[0] >= NT_START) + len(lxx_eq)

    def weight(p):
        d = (df_h if p.startswith("H") else df_g)[p]
        if d == 0 or d > MAX_DF:
            return 0.0
        n = n_h if p.startswith("H") else n_g
        return math.log(n / d)

    def lemma_set(a, b, greek):
        out = set()
        for k in range(a, b + 1):
            if k not in lem:
                continue
            bi = vid_parts(k)[0]
            if greek:
                out |= (lem[k] if bi >= NT_START else lxx_eq.get(k, set()))
            else:
                out |= lem[k]
        return out

    # stop words for quotation runs: the 70 most frequent normalized words across LXX and NT
    freq = Counter()
    for ws in list(lxx_words.values()) + list(nt_words.values()):
        freq.update(ws)
    stop = {w for w, _ in freq.most_common(70)}

    print("detecting quotations")
    quotes = detect_quotations(nt_words, lxx_words, stop)
    print("  NT-LXX shared runs (3+ words, 2+ content words):", len(quotes))

    print("loading cross references")
    ob = load_openbible()
    tsk = load_tsk()
    typo, typo_entries = load_typology()
    print("  openbible", len(ob), "tsk", len(tsk), "typology pairs", len(typo))

    # assemble raw evidence per source verse, then merge links whose target ranges overlap
    raw = defaultdict(list)  # source -> list of [b0, b1, evidence]
    for (a, rng), votes in ob.items():
        raw[a].append([rng[0], rng[1], {"V": votes}])
        if rng[0] == rng[1]:
            raw[rng[0]].append([a, a, {"V": votes}])
    for (a, rng) in tsk:
        raw[a].append([rng[0], rng[1], {"T": 1}])
        raw[rng[0]].append([a, a, {"T": 1}])
    for (a, rng), eid in typo.items():
        raw[a].append([rng[0], rng[1], {"Y": eid}])
    for (nk, ok), q in quotes.items():
        raw[nk].append([ok, ok, {"Q": q}])
        raw[ok].append([nk, nk, {"Q": q}])
    links = {}
    for a, items in raw.items():
        items.sort(key=lambda x: (x[0], x[1]))
        merged = []
        for b0, b1, ev in items:
            if merged and b0 <= merged[-1][1] and vid_parts(b0)[0] == vid_parts(merged[-1][0])[0]:
                m = merged[-1]
                m[1] = max(m[1], b1)
                e = m[2]
                if "V" in ev:
                    e["V"] = max(e.get("V", ev["V"]), ev["V"])
                if "T" in ev:
                    e["T"] = 1
                if "Y" in ev:
                    e.setdefault("Y", ev["Y"])
                if "Q" in ev and (not e.get("Q") or ev["Q"][0] > e["Q"][0]):
                    e["Q"] = ev["Q"]
            else:
                merged.append([b0, b1, dict(ev)])
        for b0, b1, ev in merged:
            if b0 <= a <= b1:
                continue  # a verse does not link to itself
            links[(a, (b0, b1))] = ev

    print("scoring", len(links), "links")
    per_verse = defaultdict(list)
    type_count = Counter()
    for (a, (b0, b1)), ev in links.items():
        if b1 - b0 > 60 and vid_parts(b0)[1] != vid_parts(b1)[1]:
            b1 = b0 + 60  # clamp very long ranges for lemma comparison
        a_nt = vid_parts(a)[0] >= NT_START
        b_nt = vid_parts(b0)[0] >= NT_START
        greek = a_nt or b_nt
        sa = lemma_set(a, a, greek)
        sb = lemma_set(b0, b1, greek)
        shared = sorted(((round(weight(p), 2), p) for p in sa & sb if weight(p) > 0), reverse=True)
        lw = sum(w for w, _ in shared)
        L = min(40, round(2.5 * lw))
        key = [w for w, _ in shared if w >= KEY_WEIGHT]
        Q = 0
        q = ev.get("Q")
        if q:
            Q = min(60, 10 * q[0])
        votes = ev.get("V")
        V = 0 if not votes or votes <= 0 else min(30, round(10 * math.log10(1 + votes)))
        T = 15 if ev.get("T") else 0
        score = Q + L + V + T
        if q and q[0] >= 4 and a_nt != b_nt:
            typ = "q"
        elif (q and q[0] == 3 and a_nt != b_nt) or (len(key) >= 3 and sum(key) >= 15 and (V >= 10 or T)):
            typ = "a"
        elif ev.get("Y"):
            typ = "t"
        elif key:
            typ = "l"
        else:
            typ = "e"
        if score <= 0 and not ev.get("Y"):
            continue
        type_count[typ] += 1
        rec = [b0, b1, typ, score, Q, L, V, T,
               [[p, round(w, 1)] for w, p in shared[:6]],
               votes if votes is not None else None]
        if q:
            rec.append([q[0], q[3]])
        else:
            rec.append(None)
        if ev.get("Y"):
            rec.append(ev["Y"])
        per_verse[a].append(rec)

    print("  types", dict(type_count))
    sizes = 0
    per_book = defaultdict(dict)
    kept = 0
    for a, recs in per_verse.items():
        recs.sort(key=lambda r: -r[3])
        recs = recs[:32]
        kept += len(recs)
        b, c, v = vid_parts(a)
        per_book[b][f"{c}:{v}"] = recs
    for bi, osis, *_ in BOOKS:
        sizes += write_json(f"xref/{osis}.json", {"b": osis, "v": per_book.get(bi, {})})
    print("  links kept", kept, "bytes", sizes)

    # typology entry labels (Torrey's em dashes become colons; see sources.json)
    labels = {eid: [t, re.sub(r"\s*" + chr(0x2014) + r"\s*", ": ", raw)] for eid, (t, raw) in typo_entries.items()}
    write_json("idx/typology.json", labels)

    # Septuagint equivalents for Word Threads
    g2h = defaultdict(Counter)
    for h, c in h2g.items():
        for g, n in c.items():
            g2h[g][h] += n
    write_json("idx/lxxeq.json", {
        "h2g": {h: [[g, n] for g, n in c.most_common(8)] for h, c in h2g.items()},
        "g2h": {g: [[h, n] for h, n in c.most_common(8)] for g, c in g2h.items()},
    })
    write_json("idx/lemma_df.json", {"h": dict(df_h), "g": dict(df_g), "nh": n_h, "ng": n_g, "max_df": MAX_DF})
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_xref.json"), "w", encoding="utf-8") as f:
        json.dump({"counts": dict(REPORT), "types": dict(type_count), "examples": EXAMPLES,
                   "quotes_sample": {f"{k[0]}-{k[1]}": v for k, v in list(quotes.items())[:50]}}, f, ensure_ascii=True, indent=1)


if __name__ == "__main__":
    main()
