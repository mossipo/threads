#!/usr/bin/env python3
"""Negation, limitation and condition markers per verse, for the claim test's tension rule.

  data/idx/markers.json  {"m": [Strong's keys], "v": {verse id: bitmask of markers present}}
Only words of the Masoretic Text (not STEPBible X or R words) and of the NA text or TR count.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BOOKS, NT_START, vid, read_json, write_json

MARKERS = ["G3756", "G3361", "G3762", "G3367", "G3761", "G3366", "G4133", "G1437", "G1487", "G235",
           "H3808", "H408", "H369", "H1115", "H518", "H389", "H7535", "H657"]


def plain(s):
    m = re.match(r"([HG])0*(\d+)", s or "")
    return f"{m.group(1)}{int(m.group(2))}" if m else None


def main():
    out = {}
    for bi, osis, *_ in BOOKS:
        d = read_json(f"orig/{osis}.json")["v"]
        # lemma sequence per verse (Strong's numbers without the H or G), for the claim test's word-order rules.
        # Hebrew words marked X or R by STEPBible are left out, as in the claim test.
        seq = {}
        for key, ent in d.items():
            nums = []
            for w in ent["w"]:
                if bi < NT_START and w[6].startswith(("X", "R")):
                    continue
                p = plain(w[3])
                nums.append(int(p[1:]) if p else 0)
            seq[key] = nums
        write_json(f"idx/seq/{osis}.json", seq)
        for key, ent in d.items():
            c, v = map(int, key.split(":"))
            bits = 0
            for w in ent["w"]:
                if bi >= NT_START and not re.search(r"[NK]", w[6]):
                    continue
                if bi < NT_START and w[6].startswith(("X", "R")):
                    continue
                for tag in re.findall(r"[HG]\d+", f"{w[3]} {w[4]}"):
                    p = plain(tag)
                    if p in MARKERS:
                        bits |= 1 << MARKERS.index(p)
            if bits:
                out[vid(bi, c, v)] = bits
    write_json("idx/markers.json", {"m": MARKERS, "v": out})
    print("verses with markers", len(out))


if __name__ == "__main__":
    main()
