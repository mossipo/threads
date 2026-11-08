#!/usr/bin/env python3
"""Metadata for the app: sources and licenses, AI content, journeys, build checks, file manifest."""
import datetime
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, write_json

HERE = os.path.dirname(os.path.abspath(__file__))

JOURNEYS = {
    "spirit": {
        "title": "The Spirit thread",
        "summary": "From Moses' wish to Pentecost, with the Septuagint and the Community Rule alongside.",
        "steps": [
            {"kind": "passage", "ref": "Num.11.29", "context": "Num.11.24-Num.11.30", "title": "Moses' wish"},
            {"kind": "heb-lxx", "ref": "Joel.2.28-Joel.2.32", "title": "Joel's promise: Hebrew and Septuagint", "note": "spirit.joel"},
            {"kind": "passage", "ref": "Ezek.36.26-Ezek.36.27", "title": "A new heart and my Spirit within you"},
            {"kind": "passage", "ref": "Ezek.37.1-Ezek.37.14", "title": "The valley of dry bones"},
            {"kind": "passage", "ref": "Luke.24.49", "title": "The promise of the Father"},
            {"kind": "nt-lxx", "ref": "Acts.2.1-Acts.2.21", "quote": "Acts.2.17-Acts.2.21", "source": "Joel.2.28-Joel.2.32",
             "title": "Pentecost: Peter's quotation and the Septuagint", "note": "spirit.acts"},
            {"kind": "scroll", "passages": ["1QS 3:6-9", "1QS 4:20-23", "1QS 8:14-16", "1QS 9:3-5"],
             "title": "The Community Rule's 'holy spirit' (Tier 3)", "note": "spirit.1qs"},
        ],
    },
    "signs": {
        "title": "The messianic signs",
        "summary": "Isaiah 61 in Hebrew and Greek, 4Q521 beside it, then Jesus reading Isaiah at Nazareth and answering John.",
        "steps": [
            {"kind": "heb-lxx", "ref": "Isa.61.1-Isa.61.2", "title": "The anointed herald: Isaiah 61:1-2, Hebrew and Septuagint", "note": "signs.isa"},
            {"kind": "scroll", "passages": ["4Q521 f2ii+4:1-14"], "title": "4Q521: the Lord's anointed and the signs (Tier 3)", "note": "signs.4q521"},
            {"kind": "nt-lxx", "ref": "Luke.4.16-Luke.4.21", "quote": "Luke.4.18-Luke.4.19", "source": "Isa.61.1-Isa.61.2",
             "extra": [["Luke.4.18", "Isa.58.6"]], "title": "Nazareth: Jesus reads Isaiah (Luke 4:16-21)", "note": "signs.luke4"},
            {"kind": "passage", "ref": "Luke.7.22", "context": "Luke.7.18-Luke.7.23", "title": "The signs reported to John (Luke 7:22)", "note": "signs.luke7"},
        ],
    },
}


def fill_missing():
    """Every per-book folder gets a file for every book, empty when there is no data, so the app never asks for a missing file."""
    from common import BOOKS, NT_START
    for folder, ot_only in (("text", False), ("orig", False), ("lxx", True), ("dss/bib", True), ("anf/idx", False)):
        for bi, osis, *_ in BOOKS:
            if ot_only and bi >= NT_START:
                continue
            path = os.path.join(DATA, folder, f"{osis}.json")
            if not os.path.exists(path):
                write_json(f"{folder}/{osis}.json", {"b": osis, "v": {}} if folder != "anf/idx" else {})


def main():
    fill_missing()
    with open(os.path.join(HERE, "sources.json"), encoding="utf-8") as f:
        sources = json.load(f)
    with open(os.path.join(HERE, "ai_content.json"), encoding="utf-8") as f:
        ai = json.load(f)
    write_json("meta/sources.json", sources)
    write_json("ai/ai.json", ai)
    write_json("journeys/journeys.json", JOURNEYS)

    reports = {}
    for name in ("report_text.json", "report_xref.json", "report_dss.json"):
        p = os.path.join(HERE, name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                r = json.load(f)
            reports[name[7:-5]] = {k: v for k, v in r.items() if k in ("counts", "types", "stats", "unknown_books", "scrolls")}
    write_json("meta/checks.json", reports)

    packs = {"core": ["text/", "orig/", "lex/", "idx/", "meta/", "ai/", "journeys/"],
             "links": ["xref/", "topics/"],
             "witnesses": ["lxx/", "dss/", "anf/", "josephus/"]}
    files = {k: [] for k in packs}
    total = 0
    for root, _, names in os.walk(DATA):
        for n in names:
            rel = os.path.relpath(os.path.join(root, n), DATA).replace(os.sep, "/")
            if rel == "meta/files.json":
                continue
            size = os.path.getsize(os.path.join(root, n))
            total += size
            for k, prefixes in packs.items():
                if rel.startswith(tuple(prefixes)):
                    files[k].append([rel, size])
                    break
    for k in files:
        files[k].sort()
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=os.path.dirname(DATA),
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = ""
    write_json("meta/files.json", {"built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                                   "commit": commit, "total": total, "packs": files})
    print("data bytes", total, {k: len(v) for k, v in files.items()})


if __name__ == "__main__":
    main()
