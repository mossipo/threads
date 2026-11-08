#!/usr/bin/env python3
"""Tier 1 text: English Bibles (BSB, WEB, KJV) and the Hebrew and Greek words underneath.

Reference system: English (KJV) verse numbers, the numbering used by the BSB, the KJV,
the OpenBible cross references and the TSK. Hebrew and NA numbering are kept as notes.

Outputs
  data/text/<Book>.json    English text per verse
  data/orig/<Book>.json    Hebrew or Greek words per verse, SBLGNT line for the NT
  data/idx/verses.json     verse inventory
  data/idx/lemma/<k>.json  occurrences of each dStrong lemma
  data/idx/en/<letter>.json English (BSB) word index
  data/idx/en2strong.json  English word to Strong's distribution (from the BSB alignment)
  build/report_text.json   counts and every mismatch found by the checks
"""
import csv
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (BOOKS, BY_OSIS, BY_STEP, BY_USFM, BY_INDEX, SWORD_NAMES, NT_START, SRC,
                    vid, vid_parts, write_json, heb_consonants, norm_greek, strip_marks)

REPORT = defaultdict(list)
COUNTS = Counter()


def note(kind, msg):
    COUNTS[kind] += 1
    if len(REPORT[kind]) < 200:
        REPORT[kind].append(msg)


# ---------------------------------------------------------------- BSB
def load_bsb_interlinear():
    base = os.path.join(SRC, "bsb/public/bsb-data/display")
    out = {}
    for code in os.listdir(base):
        d = os.path.join(base, code)
        if not os.path.isdir(d) or code not in BY_USFM:
            continue
        bi = BY_USFM[code][0]
        for fn in os.listdir(d):
            c = int(re.sub(r"\D", "", fn[len(code):]))
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                j = json.load(f)
            for v, segs in j["eng"].items():
                out[vid(bi, c, int(v))] = [[t, s] for t, s in segs]
    return out


def load_scrollmapper_bsb():
    out = {}
    path = os.path.join(SRC, "openbible/formats/csv/BSB.csv")
    with open(path, encoding="utf-8") as f:
        r = csv.reader(f)
        next(r)
        for book, c, v, text in r:
            osis = SWORD_NAMES.get(book)
            b = BY_OSIS[osis] if osis else next((x for x in BOOKS if x[2] == book), None)
            if b is None:
                note("scrollmapper_unknown_book", book)
                continue
            out[vid(b[0], int(c), int(v))] = text.strip()
    return out


def load_ebible_bsb():
    vref = open(os.path.join(SRC, "ebible/metadata/vref.txt"), encoding="utf-8").read().split("\n")
    lines = open(os.path.join(SRC, "ebible/corpus/eng-engbsb.txt"), encoding="utf-8").read().split("\n")
    out = {}
    for r, t in zip(vref, lines):
        if not r.strip() or not t.strip():
            continue
        code, cv = r.split(" ")
        c, v = cv.split(":")
        if code in BY_USFM:
            out[vid(BY_USFM[code][0], int(c), int(v))] = t.strip()
    return out


def squash(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("’", "'"))



def interlinear_display(segs):
    """Reading form of interlinear segments: drop placeholders (vvv, . . ., {}) and brackets."""
    out = "".join(clean_seg(t) for t, _ in segs)
    out = re.sub(r"\s+([,.;:!?])", r"\1", out)
    out = re.sub(r"(^|\s)-(\s|$)", " ", out)
    return re.sub(r"\s+", " ", out).strip()


def clean_seg(t):
    t = t.replace("vvv", "").replace(". . .", "").replace("{}", "")
    return re.sub(r"[\[\]]", "", t)


def split_title(full, body):
    """full = title + body (published copy); body = verse text without title (eBible copy)."""
    want = squash(body)
    for i in range(len(full)):
        if squash(full[i:]) == want:
            while i < len(full) and not (full[i].isalnum() or full[i] in "\u201c\u2018\"("):
                i += 1
            return full[:i].strip(), full[i:].strip()
    return "", full


TOKEN = re.compile(r"[A-Za-z0-9’']+")


def align_bsb(text, segs):
    """Split the published verse text into [text, strongs] runs using the interlinear tags."""
    if not segs:
        return [[text, None]]
    iw, itag = [], []
    for t, s_ in segs:
        for w in TOKEN.findall(clean_seg(t)):
            iw.append(w.lower())
            itag.append(s_)
    toks = [(m.start(), m.end(), m.group(0).lower()) for m in TOKEN.finditer(text)]
    from difflib import SequenceMatcher
    sm_ = SequenceMatcher(None, [t[2] for t in toks], iw, autojunk=False)
    tag = [None] * len(toks)
    for a, b2, n in sm_.get_matching_blocks():
        for i in range(n):
            tag[a + i] = itag[b2 + i]
    out = []
    pos = 0
    for (st, en, _), tg in zip(toks, tag):
        if st > pos:
            gap = text[pos:st]
            if out:
                out[-1][0] += gap
            else:
                out.append([gap, None])
        out.append([text[st:en], tg])
        pos = en
    if pos < len(text):
        if out:
            out[-1][0] += text[pos:]
        else:
            out.append([text[pos:], None])
    # merge neighbours that share a tag (words of one phrase) when only spaces separate them
    merged = []
    for t, tg in out:
        if merged and tg is not None and merged[-1][1] == tg and re.fullmatch(r".*\s", merged[-1][0], re.S):
            merged[-1][0] += t
        elif merged and tg is None and merged[-1][1] is None:
            merged[-1][0] += t
        else:
            merged.append([t, tg])
    return merged


# ---------------------------------------------------------------- WEB and KJV
TAG = re.compile(r"<[^>]+>")


def clean_text(s):
    s = TAG.sub("", s)
    s = s.replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def load_web():
    path = os.path.join(SRC, "openbibles/eng-web.usfx.xml")
    s = open(path, encoding="utf-8").read()
    # drop footnotes, cross references, and introductory material
    s = re.sub(r"<f\b.*?</f>", "", s, flags=re.S)
    s = re.sub(r"<x\b.*?</x>", "", s, flags=re.S)
    s = re.sub(r"<(?:h|toc|id|ide|rem|s|ms|mt|imt|ip|is|io|iot|ili|ie|cl)\b[^>]*>.*?</(?:h|toc|id|ide|rem|s|ms|mt|imt|ip|is|io|iot|ili|ie|cl)>", "", s, flags=re.S)
    out, titles = {}, {}
    for bm in re.finditer(r'<book id="([0-9A-Z]{3})">(.*?)</book>', s, flags=re.S):
        code, body = bm.group(1), bm.group(2)
        if code not in BY_USFM:
            continue
        bi = BY_USFM[code][0]
        parts = re.split(r'(<c id="\d+"\s*/>|<v id="[^"]+"\s*/>|<ve\s*/>|<d>.*?</d>)', body, flags=re.S)
        c = v = None
        buf = []
        for p in parts:
            m = re.match(r'<c id="(\d+)"', p)
            if m:
                c, v = int(m.group(1)), None
                continue
            m = re.match(r'<v id="(\d+)', p)
            if m:
                v, buf = int(m.group(1)), []
                continue
            if p.startswith("<ve"):
                if c and v:
                    out[vid(bi, c, v)] = clean_text(" ".join(buf))
                v, buf = None, []
                continue
            if p.startswith("<d>"):
                if c:
                    titles[vid(bi, c, 0)] = clean_text(p)
                continue
            if v is not None:
                buf.append(p)
    return out, titles


def load_kjv():
    path = os.path.join(SRC, "openbibles/eng-kjv.osis.xml")
    s = open(path, encoding="utf-8").read()
    s = re.sub(r"<note\b.*?</note>", "", s, flags=re.S)
    out, titles = {}, {}
    for m in re.finditer(r'<title type="psalm"[^>]*>(.*?)</title>', s, flags=re.S):
        before = s.rfind('<chapter osisRef="', 0, m.start())
        cm = re.match(r'<chapter osisRef="Ps\.(\d+)"', s[before:before + 40])
        if cm:
            titles[vid(19, int(cm.group(1)), 0)] = clean_text(m.group(1))
    for m in re.finditer(r'<verse osisID="([^"]+)" sID="([^"]+)"[^>]*/>(.*?)<verse eID="\2"\s*/>', s, flags=re.S):
        osis = m.group(1).split(" ")[0]
        bk, c, v = osis.split(".")
        if bk not in BY_OSIS:
            continue
        text = re.sub(r'<title\b.*?</title>', "", m.group(3), flags=re.S)
        out[vid(BY_OSIS[bk][0], int(c), int(v))] = clean_text(text)
    return out, titles


# ---------------------------------------------------------------- STEPBible TAHOT / TAGNT
REF_RE = re.compile(r"^([0-9A-Za-z]+)\.(\d+)\.(\d+)((?:[\(\[\{][\d.]+[\)\]\}])*)#(\d+)=(\S+)$")


def parse_ref(field):
    m = REF_RE.match(field)
    if not m:
        return None
    book, c, v, brackets, wn, wtype = m.groups()
    alt = {"(": None, "[": None, "{": None}
    for bm in re.finditer(r"([\(\[\{])([\d.]+)[\)\]\}]", brackets or ""):
        alt[bm.group(1)] = bm.group(2)
    return book, int(c), int(v), alt, int(wn), wtype


def step_files(prefix):
    d = os.path.join(SRC, "stepbible/Translators Amalgamated OT+NT")
    return sorted(glob.glob(os.path.join(d, prefix + "*.txt")))


def plain_nums(text):
    return {(m.group(1), int(m.group(2))) for m in re.finditer(r"([HG])0*(\d+)", text)}


def cv(s):
    c, v = s.split(".")
    return int(c), int(v)


def load_tahot():
    """Return {vid: {'h': hebrew ref or None, 'w': [...]}} keyed by English verse (verse 0 = Psalm title)."""
    verses = {}
    order = ["Gen-Deu", "Jos-Est", "Job-Sng", "Isa-Mal"]
    files = sorted(step_files("TAHOT"), key=lambda p: next(i for i, o in enumerate(order) if o in p))
    for path in files:
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                if not line or line[0] in "#\t \n=" or "#" not in line[:30]:
                    continue
                cols = line.rstrip("\n").split("\t")
                r = parse_ref(cols[0])
                if not r:
                    continue
                book, c, v, alt, wn, wtype = r
                if book not in BY_STEP:
                    note("tahot_unknown_book", book)
                    continue
                bi = BY_STEP[book][0]
                key = vid(bi, c, v)
                ent = verses.setdefault(key, {"h": None, "w": [], "nums": set()})
                if alt["("]:
                    ent["h"] = alt["("]
                if alt["["]:
                    note("tahot_kjv_bracket", cols[0])
                cols += [""] * (12 - len(cols))
                heb, translit, eng, dstrongs, grammar = cols[1], cols[2], cols[3], cols[4], cols[5]
                mean_var, spell_var, root = cols[6], cols[7], cols[8]
                expanded = cols[11]
                lex = ""
                m = re.search(r"\{(H\d+[A-Z]?)=([^=]+)=", expanded)
                if m:
                    lex = m.group(2)
                root = re.sub(r"_[A-Za-z]+$", "", root.strip())  # drop the per-verse instance mark (_A, _B ...)
                ent["nums"].update(plain_nums(" ".join([root, dstrongs, cols[9]])))
                ent["w"].append([
                    heb.replace("/", "").replace("\\", ""),  # 0 Hebrew as printed
                    translit.replace("/", ""),               # 1 transliteration
                    eng,                                      # 2 English gloss (slashes mark prefix/root/suffix)
                    root,                                     # 3 root dStrong (lemma key)
                    "" if dstrongs == "{" + root + "}" else dstrongs,  # 4 all dStrongs when prefixes or suffixes exist
                    grammar,                                  # 5 grammar code
                    wtype,                                    # 6 text type (L, Q(K), K, X ...)
                    mean_var.strip(),                         # 7 meaning variants
                    spell_var.strip(),                        # 8 spelling variants
                    cols[9].strip(),                          # 9 alternative Strong's tags
                ])
    return verses


EDITIONS = ["NA28", "NA27", "Tyn", "SBL", "WH", "Treg", "TR", "Byz"]


def load_tagnt():
    verses = {}
    na_to_kjv = {}
    for path in step_files("TAGNT"):
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                if not line or line[0] in "#\t \n=" or "#" not in line[:30]:
                    continue
                cols = line.rstrip("\n").split("\t")
                r = parse_ref(cols[0])
                if not r:
                    continue
                book, c, v, alt, wn, wtype = r
                if book not in BY_STEP:
                    note("tagnt_unknown_book", book)
                    continue
                bi = BY_STEP[book][0]
                kc, kv = cv(alt["["]) if alt["["] else (c, v)
                nc, nv = cv(alt["("]) if alt["("] else (c, v)
                key = vid(bi, kc, kv)
                na_to_kjv[vid(bi, nc, nv)] = key
                cols += [""] * (14 - len(cols))
                greek_tr = cols[1]
                m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", greek_tr)
                greek, translit = (m.group(1), m.group(2)) if m else (greek_tr, "")
                ds, _, grammar = cols[3].partition("=")
                dict_form, _, gloss = cols[4].partition("=")
                ent = verses.setdefault(key, {"w": [], "nums": set()})
                ent["nums"].update(plain_nums(" ".join([cols[3], cols[11], cols[12]])))
                eds = cols[5].strip()
                bits, rest = 0, []
                for tok in eds.split("+"):
                    tok = tok.strip()
                    if tok in EDITIONS:
                        bits |= 1 << EDITIONS.index(tok)
                    elif tok:
                        rest.append(tok)
                ent["w"].append([
                    greek.strip(),          # 0 Greek as printed in TAGNT
                    translit.strip(),       # 1 transliteration
                    cols[2].strip(),        # 2 English
                    ds.strip(),             # 3 dStrong (lemma key)
                    "",                     # 4 (unused for Greek)
                    grammar.strip(),        # 5 grammar code
                    wtype,                  # 6 word type (NKO, K, N(k)O ...)
                    cols[6].strip(),        # 7 meaning variants
                    cols[7].strip(),        # 8 spelling variants
                    bits,                   # 9 editions bitmask (see EDITIONS)
                    "+".join(rest),         # 10 other edition notes
                    cols[13].strip(),       # 11 variant note
                    cols[12].strip(),       # 12 alternative Strong's tags
                ])
    return verses, na_to_kjv


SBL_SIGNS = re.compile("[⸀-⸏⸜⸝]")


def load_sblgnt(na_to_kjv):
    out = {}
    base = os.path.join(SRC, "sblgnt/data/sblgnt/text")
    for fn in sorted(os.listdir(base)):
        osis = fn[:-4]
        if osis not in BY_OSIS:
            note("sblgnt_unknown_book", fn)
            continue
        bi = BY_OSIS[osis][0]
        with open(os.path.join(base, fn), encoding="utf-8-sig") as f:
            for line in f:
                m = re.match(r"^\S+(?: \S+)? (\d+):(\d+)\t(.*)$", line.rstrip("\n"))
                if not m:
                    continue
                c, v, text = int(m.group(1)), int(m.group(2)), m.group(3)
                text = re.sub(r"\s+", " ", SBL_SIGNS.sub("", text)).strip()
                na = vid(bi, c, v)
                key = na_to_kjv.get(na, na)
                if key != na:
                    note("sblgnt_renumbered", f"{osis} {c}:{v} -> {vid_parts(key)[1]}:{vid_parts(key)[2]}")
                out[key] = (out[key] + " " + text) if key in out else text
    return out


# ---------------------------------------------------------------- main
WORD_RE = re.compile(r"[A-Za-z]+(?:'[a-z]+)?")


def main():
    print("loading English texts")
    inter = load_bsb_interlinear()
    smap = load_scrollmapper_bsb()
    eb = load_ebible_bsb()
    web, web_titles = load_web()
    kjv, kjv_titles = load_kjv()
    print("  interlinear", len(inter), "scrollmapper", len(smap), "web", len(web), "kjv", len(kjv))

    # canonical inventory: KJV verse list (31,102) plus WEB-only verses (e.g. Rom 14:24-26 in the WEB)
    inventory = set(kjv)
    for k in web:
        if k not in inventory:
            note("web_only_verse", k)
            inventory.add(k)

    # BSB reading text: the published text (scrollmapper copy, which agrees with the eBible copy in
    # 99.2 percent of verses; the rest differ only in where list items fall at verse breaks).
    # Psalm titles are fused into verse 1 in that copy, so they are split off using the eBible verse 1.
    # Word alignment to Strong's comes from the interlinear data, matched word by word.
    bsb, bsb_titles = {}, {}
    for k in inventory:
        b, c, v = vid_parts(k)
        text = smap.get(k, "")
        if not text:
            if k in inter:
                note("bsb_only_in_interlinear", k)
                text = interlinear_display(inter[k])
            else:
                COUNTS["bsb_absent"] += 1  # not in the BSB (e.g. John 5:4, Acts 8:37)
                continue
        if b == 19 and v == 1 and k in eb and squash(text) != squash(eb[k]) and squash(text).endswith(squash(eb[k])):
            title, body = split_title(text, eb[k])
            if title:
                bsb_titles[vid(b, c, 0)] = title
                text = body
                COUNTS["bsb_psalm_title_split"] += 1
        segs = align_bsb(text, inter.get(k))
        bsb[k] = segs
        if k in inter:
            tagged = sum(1 for t, s_ in segs if s_)
            COUNTS["bsb_aligned_segments"] += tagged
        else:
            COUNTS["bsb_verse_without_alignment"] += 1
        if k in inter and squash(interlinear_display(inter[k])) != squash(text):
            note("bsb_interlinear_wording_differs", f"{k}: {interlinear_display(inter[k])[:70]} || {text[:70]}")

    print("loading Hebrew and Greek")
    tahot = load_tahot()
    tagnt, na_to_kjv = load_tagnt()
    sbl = load_sblgnt(na_to_kjv)
    print("  tahot verses", len(tahot), "tagnt verses", len(tagnt), "sblgnt", len(sbl))

    # every BSB alignment tag must name a lemma that is really in the Hebrew or Greek of that verse
    for k, segs in bsb.items():
        src = tahot.get(k) or tagnt.get(k)
        if not src:
            continue
        for seg in segs:
            tg = seg[1]
            if not tg:
                continue
            pn = plain_nums(tg)
            if pn and not (pn & src["nums"]):
                note("bsb_tag_not_in_verse", f"{k}: '{seg[0].strip()}' {tg}")
                seg[1] = "?" + tg
            else:
                COUNTS["bsb_tag_verified"] += 1

    for k in tahot:
        if vid_parts(k)[2] != 0 and k not in inventory:
            note("tahot_verse_not_in_inventory", k)
    for k in tagnt:
        if k not in inventory:
            note("tagnt_verse_not_in_inventory", k)
    for k in sbl:
        if k not in inventory:
            note("sblgnt_verse_not_in_inventory", k)

    # check TAGNT SBL-flagged words against the SBLGNT verse text, word by word
    for k, ent in tagnt.items():
        if k not in sbl:
            continue
        words = [norm_greek(w[0]) for w in ent["w"] if w[9] & (1 << EDITIONS.index("SBL"))]
        sbl_words = [norm_greek(x) for x in re.sub(r"[⟦⟧]", "", sbl[k]).split()]
        sbl_words = [x for x in sbl_words if x]
        if Counter(words) != Counter(sbl_words):
            note("tagnt_sbl_wordset_mismatch", f"{k}: TAGNT[SBL]={len(words)} SBLGNT={len(sbl_words)} diff={list((Counter(words)-Counter(sbl_words)).elements())[:4]}/{list((Counter(sbl_words)-Counter(words)).elements())[:4]}")
        else:
            COUNTS["tagnt_sbl_wordset_match"] += 1

    # ---------------- write per-book files
    by_book_text = defaultdict(dict)
    by_book_orig = defaultdict(dict)
    for k in sorted(inventory | set(web_titles) | set(kjv_titles) | set(bsb_titles)):
        b, c, v = vid_parts(k)
        e = {}
        if k in bsb:
            e["bsb"] = bsb[k]
        if k in web:
            e["web"] = web[k]
        if k in kjv:
            e["kjv"] = kjv[k]
        if v == 0:
            e = {}
            if k in bsb_titles:
                e["bsb"] = [[bsb_titles[k], None]]
            if k in web_titles:
                e["web"] = web_titles[k]
            if k in kjv_titles:
                e["kjv"] = kjv_titles[k]
        if e:
            by_book_text[b][f"{c}:{v}"] = e
    for k, ent in tahot.items():
        b, c, v = vid_parts(k)
        o = {"w": ent["w"]}
        if ent["h"]:
            o["h"] = ent["h"]
        by_book_orig[b][f"{c}:{v}"] = o
    for k, ent in tagnt.items():
        b, c, v = vid_parts(k)
        o = {"w": ent["w"]}
        if k in sbl:
            o["g"] = sbl[k]
        by_book_orig[b][f"{c}:{v}"] = o
    for k, text in sbl.items():
        b, c, v = vid_parts(k)
        if f"{c}:{v}" not in by_book_orig[b]:
            by_book_orig[b][f"{c}:{v}"] = {"w": [], "g": text}

    sizes = Counter()
    chapters = {}
    for bi, name_osis, *_ in BOOKS:
        tv = by_book_text.get(bi, {})
        ov = by_book_orig.get(bi, {})
        sizes["text"] += write_json(f"text/{name_osis}.json", {"b": name_osis, "v": tv})
        sizes["orig"] += write_json(f"orig/{name_osis}.json", {"b": name_osis, "v": ov})
        chap = defaultdict(int)
        for key in tv:
            c, v = map(int, key.split(":"))
            if v > 0:
                chap[c] = max(chap[c], v)
        chapters[name_osis] = [chap[c] for c in sorted(chap)]

    # ---------------- indexes
    print("building indexes")
    lemma_occ = defaultdict(list)
    for src in (tahot, tagnt):
        for k, ent in src.items():
            seen = Counter()
            for w in ent["w"]:
                key = w[3]
                if src is tagnt:
                    # only words in the NA text or the TR count as occurrences (not "O" only readings)
                    if not re.search(r"[NK]", w[6]):
                        continue
                elif w[6].startswith(("X", "R")):
                    continue  # retroverted from the Septuagint, or restored from a parallel passage
                if key:
                    seen[key] += 1
            for key, n in seen.items():
                lemma_occ[key].append(k if n == 1 else [k, n])
    blocks = defaultdict(dict)
    for key, occ in lemma_occ.items():
        m = re.match(r"([HG])(\d+)", key)
        if not m:
            continue
        blocks[f"{m.group(1)}{int(m.group(2)) // 500}"][key] = occ
    for bkey, d in blocks.items():
        sizes["lemma"] += write_json(f"idx/lemma/{bkey}.json", d)

    en_idx = defaultdict(lambda: defaultdict(list))
    en2s = defaultdict(Counter)
    for k, segs in bsb.items():
        text = "".join(t for t, _ in segs)
        for t, s_ in segs:
            if s_:
                for wd in WORD_RE.findall(t.lower()):
                    en2s[wd][s_] += 1
        words = set(WORD_RE.findall(text.lower()))
        for wd in words:
            en_idx[wd[0]][wd].append(k)
    for letter, d in en_idx.items():
        sizes["en"] += write_json(f"idx/en/{letter}.json", {w: sorted(v) for w, v in d.items()})
    en2s_out = {w: [[s, n] for s, n in c.most_common(6) if n >= 2] for w, c in en2s.items()}
    en2s_out = {w: v for w, v in en2s_out.items() if v}
    sizes["en2strong"] = write_json("idx/en2strong.json", en2s_out)

    heb_num = {}
    for k, ent in tahot.items():
        if ent["h"]:
            b, c, v = vid_parts(k)
            heb_num[f"{BY_INDEX[b][1]}.{c}.{v}"] = ent["h"]
    write_json("idx/verses.json", {"chapters": chapters, "heb": heb_num, "count": len(inventory)})

    rep = {"counts": dict(COUNTS), "sizes": dict(sizes), "examples": REPORT}
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_text.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=True, indent=1)
    print(json.dumps({"counts": dict(COUNTS), "sizes": dict(sizes)}, indent=1))


if __name__ == "__main__":
    main()
