#!/usr/bin/env python3
"""Josephus, Antiquities of the Jews (Whiston), from Project Gutenberg #2848 via GITenberg. Tier 3.

  data/josephus/ant/<book>.json  {"book": n, "title": str, "chapters": [[chapter, title, [[section, text], ...]], ...]}
Book 0 is Josephus' preface. Whiston's footnotes are left out (they are Whiston's, not Josephus').
Em dashes in this non-Bible source text are shown as spaced hyphens.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SRC, write_json

ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50}


def roman(s):
    total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
    return total


def clean(t):
    t = re.sub(r"\s*—\s*", " - ", t)
    t = re.sub(r"(?<=[a-z.,;:!?\"'])(\d{1,3})(?=\s|$)", "", t)  # footnote numbers glued to words
    return re.sub(r"\s+", " ", t).strip()


def main():
    raw = open(os.path.join(SRC, "josephus_ant/2848-8.txt"), "rb").read().decode("cp1252")
    body = raw[raw.find("*** START OF"):raw.find("*** END OF")]
    lines = body.replace("\r\n", "\n").split("\n")
    # the table of contents repeats every heading; the text proper starts at the second PREFACE
    starts = [i for i, l in enumerate(lines) if l.startswith("PREFACE")]
    lines = lines[starts[1]:]
    books = {0: {"book": 0, "title": "Preface", "chapters": [[0, "Preface", []]]}}
    cur_book, cur_ch, in_notes = 0, books[0]["chapters"][0], False
    para = []

    def flush():
        nonlocal para
        if not para or in_notes:
            para = []
            return
        text = clean(" ".join(para))
        para = []
        if not text:
            return
        m = re.match(r"^(\d+)\.\s+(.*)$", text)
        secs = cur_ch[2]
        if m:
            secs.append([int(m.group(1)), m.group(2)])
        elif secs:
            secs[-1][1] += " " + text
        else:
            secs.append([1, text])

    i = 0
    while i < len(lines):
        l = lines[i].rstrip()
        bm = re.match(r"^BOOK ([IVXL]+)\.\s*(.*)$", l)
        cm = re.match(r"^CHAPTER (\d+)\.\s*(.*)$", l)
        if bm or cm:
            flush()
            title = (bm or cm).group(2)
            j = i + 1
            while j < len(lines) and lines[j].strip():
                title += " " + lines[j].strip()
                j += 1
            title = clean(title)
            if bm:
                cur_book = roman(bm.group(1))
                books[cur_book] = {"book": cur_book, "title": title, "chapters": []}
                cur_ch = [0, "", []]
            else:
                cur_ch = [int(cm.group(1)), title, []]
                books[cur_book]["chapters"].append(cur_ch)
            in_notes = False
            i = j
            continue
        if re.match(r"^FOOTNOTES:?\s*$", l):
            flush()
            in_notes = True
        elif not l.strip():
            flush()
        else:
            para.append(l.strip())
        i += 1
    flush()
    total = 0
    sections = 0
    for n, b in books.items():
        b["chapters"] = [c for c in b["chapters"] if c[2]]
        sections += sum(len(c[2]) for c in b["chapters"])
        total += write_json(f"josephus/ant/{n}.json", b)
    print("books", len(books), "sections", sections, "bytes", total)


if __name__ == "__main__":
    main()
