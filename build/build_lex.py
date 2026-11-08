#!/usr/bin/env python3
"""Lexicons keyed by Strong's number.

  data/lex/<H|G><block>.json  per plain Strong's number:
      d   STEPBible brief lexicon entries for each dStrong (lemma, transliteration, morph, gloss, meaning)
      bdb Brown-Driver-Briggs (Hebrew) as simple HTML
      as  Abbott-Smith (Greek) as simple HTML
      th  Thayer (Greek) as simple HTML
  data/lex/morph.json  grammar code -> plain English (STEPBible TEHMC and TEGMC)
"""
import glob
import html
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SRC, BY_STEP, DATA, write_json

BLOCK = 250


def plain_key(s):
    m = re.match(r"([HG])0*(\d+)", s)
    return f"{m.group(1)}{int(m.group(2))}" if m else None


def block_of(key):
    return f"{key[0]}{int(key[1:]) // BLOCK}"


def step_ref_to_osis(ref):
    m = re.match(r"([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)", ref)
    if m and m.group(1) in BY_STEP:
        return f"{BY_STEP[m.group(1)][1]}.{m.group(2)}.{m.group(3)}"
    return None


def clean_step_html(s):
    s = s.replace("<BR />", "<br>").replace("<BR/>", "<br>").replace("<br />", "<br>")

    def ref(m):
        osis = step_ref_to_osis(m.group(1))
        label = m.group(2)
        return f'<a data-ref="{osis}">{label}</a>' if osis else label
    s = re.sub(r"<ref='([^']+)'>(.*?)</ref>", ref, s)
    s = re.sub(r"<(?!/?(?:b|i|br|a)\b)[^>]+>", "", s)
    return s.strip()


def load_brief(prefix):
    path = glob.glob(os.path.join(SRC, "stepbible/Lexicons", prefix + "*.txt"))[0]
    out = defaultdict(dict)
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 8 or not re.match(r"^[HG]\d", cols[0]):
                continue
            dkey = cols[1].split("=")[0].strip()
            if not re.match(r"^[HG]\d+[A-Za-z]?$", dkey):
                continue
            pk = plain_key(dkey)
            out[pk][dkey] = {
                "l": cols[3].strip(),
                "t": cols[4].strip(),
                "m": cols[5].strip(),
                "g": cols[6].strip(),
                "x": clean_step_html(cols[7]),
            }
            if "a Meaning of" in cols[1]:
                out[pk][dkey]["of"] = cols[2].strip()
    return out


def element_html(el, mapping):
    """Very small XML to HTML converter: keeps text, maps some tags."""
    parts = []

    def walk(e):
        tag = e.tag.split("}")[-1]
        open_t, close_t = mapping.get(tag, ("", ""))
        if tag == "sense" and e.get("n"):
            n = e.get("n")
            open_t = open_t + f"<b>{html.escape(n if n.endswith('.') else n + '.')}</b> "
        if tag == "ref" and e.get("osisRef"):
            open_t, close_t = f'<a data-ref="{html.escape(e.get("osisRef"))}">', "</a>"
        parts.append(open_t)
        if e.text:
            parts.append(html.escape(e.text))
        for c in e:
            walk(c)
            if c.tail:
                parts.append(html.escape(c.tail))
        parts.append(close_t)
    walk(el)
    s = "".join(parts)
    return re.sub(r"\s+", " ", s).strip()


def load_bdb():
    idx = ET.parse(os.path.join(SRC, "bdb/LexicalIndex.xml")).getroot()
    strong_to_bdb = defaultdict(list)
    for x in idx.iter():
        if x.tag.split("}")[-1] == "xref" and x.get("strong") and x.get("bdb"):
            for sn in re.findall(r"\d+", x.get("strong")):
                if x.get("bdb") not in strong_to_bdb[f"H{int(sn)}"]:
                    strong_to_bdb[f"H{int(sn)}"].append(x.get("bdb"))
    root = ET.parse(os.path.join(SRC, "bdb/BrownDriverBriggs.xml")).getroot()
    entries = {}
    mapping = {"w": ('<span class="heb">', "</span>"), "def": ("<b>", "</b>"), "em": ("<i>", "</i>"),
               "sense": ('<div class="sense">', "</div>"), "pos": ("<i>", "</i>"),
               "status": ("<!--", "-->"), "page": ("", "")}
    for e in root.iter():
        if e.tag.split("}")[-1] == "entry" and e.get("id"):
            entries[e.get("id")] = element_html(e, mapping).replace("<!--", "").replace("-->", "")
    out = {}
    for sk, ids in strong_to_bdb.items():
        htmls = [entries[i] for i in ids if i in entries]
        if htmls:
            out[sk] = "<hr>".join(re.sub(r"\b(base|made|new|done|ref|edit)\s*$", "", h).strip() for h in htmls)
    return out


def load_abbott_smith():
    root = ET.parse(os.path.join(SRC, "abbott_smith/abbott-smith.tei.xml")).getroot()
    out = {}
    mapping = {"orth": ("<b>", "</b>"), "gloss": ("<i>", "</i>"), "foreign": ('<span class="grk">', "</span>"),
               "sense": ('<div class="sense">', "</div>"), "note": ("", ""), "etym": ("", "")}
    for e in root.iter():
        if e.tag.split("}")[-1] != "entry":
            continue
        n = e.get("n") or ""
        keys = re.findall(r"G\d+", n)
        if not keys:
            continue
        h = element_html(e, mapping)
        for k in keys:
            pk = plain_key(k)
            out[pk] = (out[pk] + "<hr>" + h) if pk in out else h
    return out


def load_thayer():
    out = {}
    for path in sorted(glob.glob(os.path.join(SRC, "thayer/book/*.md"))):
        text = open(path, encoding="utf-8").read()
        chunks = re.split(r"^`Strong's (G\d+)`\s*$", text, flags=re.M)
        for i in range(1, len(chunks), 2):
            key = plain_key(chunks[i])
            body = chunks[i + 1]
            body = re.split(r"^#{1,6} ", body, flags=re.M)[0].strip()
            paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip() and not p.strip().startswith("---")]
            out[key] = "".join(f"<p>{html.escape(p)}</p>" for p in paras)
    return out


def load_morph():
    out = {}
    for path in glob.glob(os.path.join(SRC, "stepbible/Morphology codes", "TE*MC*.txt")):
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                cols = line.rstrip("\n").split("\t")
                if len(cols) >= 2 and re.match(r"^[A-Z][A-Za-z0-9-]*$", cols[0]) and "=" in cols[1]:
                    out[cols[0]] = re.sub(r"\s+;", ";", cols[1].strip())
    return out


def main():
    brief = {}
    brief.update(load_brief("TBESH"))
    brief.update(load_brief("TBESG"))
    bdb = load_bdb()
    asm = load_abbott_smith()
    th = load_thayer()
    print("brief", len(brief), "bdb", len(bdb), "abbott-smith", len(asm), "thayer", len(th))
    keys = set(brief) | set(bdb) | set(asm) | set(th)
    blocks = defaultdict(dict)
    for k in keys:
        e = {}
        if k in brief:
            e["d"] = brief[k]
        if k in bdb:
            e["bdb"] = bdb[k]
        if k in asm:
            e["as"] = asm[k]
        if k in th:
            e["th"] = th[k]
        blocks[block_of(k)][k] = e
    total = 0
    for b, d in blocks.items():
        total += write_json(f"lex/{b}.json", d)
    # grammar codes actually used in the text
    used = set()
    for path in glob.glob(os.path.join(DATA, "orig", "*.json")):
        with open(path, encoding="utf-8") as f:
            for v in json.load(f)["v"].values():
                for w in v["w"]:
                    for part in re.split(r"/", w[5]):
                        used.add(part)
                    used.add(w[5])
    morph = load_morph()
    out = {}
    for code in used:
        if code in morph:
            out[code] = morph[code]
        elif "H" + code in morph:
            out[code] = morph["H" + code]
    total += write_json("lex/morph.json", out)
    print("lexicon bytes", total, "morph codes", len(out), "of", len(used))
    # consonant index of Hebrew lemmas, used by the scroll build to gloss scroll-only words
    from common import heb_consonants
    cons = defaultdict(list)
    for pk, ds in brief.items():
        if not pk.startswith("H"):
            continue
        for dk, e in ds.items():
            if "of" in e:
                continue
            c = heb_consonants(e["l"])
            if c:
                cons[c].append([dk, e["g"]])
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "heb_lemma_consonants.json"), "w", encoding="utf-8") as f:
        json.dump(cons, f, ensure_ascii=False)
    from build_dss import pointed_key
    pointed = defaultdict(list)
    for pk, ds in brief.items():
        if pk.startswith("H"):
            for dk, e in ds.items():
                if "of" not in e and e["l"]:
                    pointed[pointed_key(e["l"])].append([dk, e["g"]])
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "heb_lemma_pointed.json"), "w", encoding="utf-8") as f:
        json.dump(pointed, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
