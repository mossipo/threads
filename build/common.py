"""Shared tables and helpers for the Threads build scripts."""
import json
import math
import os
import re
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
DATA = os.path.join(ROOT, "data")
SRC = os.environ.get("THREADS_SRC", os.path.normpath(os.path.join(ROOT, "..", "srcdata")))

# index, OSIS id, English name, STEPBible code, USFM code, short aliases
BOOKS = [
    (1, "Gen", "Genesis", "Gen", "GEN"), (2, "Exod", "Exodus", "Exo", "EXO"),
    (3, "Lev", "Leviticus", "Lev", "LEV"), (4, "Num", "Numbers", "Num", "NUM"),
    (5, "Deut", "Deuteronomy", "Deu", "DEU"), (6, "Josh", "Joshua", "Jos", "JOS"),
    (7, "Judg", "Judges", "Jdg", "JDG"), (8, "Ruth", "Ruth", "Rut", "RUT"),
    (9, "1Sam", "1 Samuel", "1Sa", "1SA"), (10, "2Sam", "2 Samuel", "2Sa", "2SA"),
    (11, "1Kgs", "1 Kings", "1Ki", "1KI"), (12, "2Kgs", "2 Kings", "2Ki", "2KI"),
    (13, "1Chr", "1 Chronicles", "1Ch", "1CH"), (14, "2Chr", "2 Chronicles", "2Ch", "2CH"),
    (15, "Ezra", "Ezra", "Ezr", "EZR"), (16, "Neh", "Nehemiah", "Neh", "NEH"),
    (17, "Esth", "Esther", "Est", "EST"), (18, "Job", "Job", "Job", "JOB"),
    (19, "Ps", "Psalms", "Psa", "PSA"), (20, "Prov", "Proverbs", "Pro", "PRO"),
    (21, "Eccl", "Ecclesiastes", "Ecc", "ECC"), (22, "Song", "Song of Songs", "Sng", "SNG"),
    (23, "Isa", "Isaiah", "Isa", "ISA"), (24, "Jer", "Jeremiah", "Jer", "JER"),
    (25, "Lam", "Lamentations", "Lam", "LAM"), (26, "Ezek", "Ezekiel", "Ezk", "EZK"),
    (27, "Dan", "Daniel", "Dan", "DAN"), (28, "Hos", "Hosea", "Hos", "HOS"),
    (29, "Joel", "Joel", "Jol", "JOL"), (30, "Amos", "Amos", "Amo", "AMO"),
    (31, "Obad", "Obadiah", "Oba", "OBA"), (32, "Jonah", "Jonah", "Jon", "JON"),
    (33, "Mic", "Micah", "Mic", "MIC"), (34, "Nah", "Nahum", "Nam", "NAM"),
    (35, "Hab", "Habakkuk", "Hab", "HAB"), (36, "Zeph", "Zephaniah", "Zep", "ZEP"),
    (37, "Hag", "Haggai", "Hag", "HAG"), (38, "Zech", "Zechariah", "Zec", "ZEC"),
    (39, "Mal", "Malachi", "Mal", "MAL"), (40, "Matt", "Matthew", "Mat", "MAT"),
    (41, "Mark", "Mark", "Mrk", "MRK"), (42, "Luke", "Luke", "Luk", "LUK"),
    (43, "John", "John", "Jhn", "JHN"), (44, "Acts", "Acts", "Act", "ACT"),
    (45, "Rom", "Romans", "Rom", "ROM"), (46, "1Cor", "1 Corinthians", "1Co", "1CO"),
    (47, "2Cor", "2 Corinthians", "2Co", "2CO"), (48, "Gal", "Galatians", "Gal", "GAL"),
    (49, "Eph", "Ephesians", "Eph", "EPH"), (50, "Phil", "Philippians", "Php", "PHP"),
    (51, "Col", "Colossians", "Col", "COL"), (52, "1Thess", "1 Thessalonians", "1Th", "1TH"),
    (53, "2Thess", "2 Thessalonians", "2Th", "2TH"), (54, "1Tim", "1 Timothy", "1Ti", "1TI"),
    (55, "2Tim", "2 Timothy", "2Ti", "2TI"), (56, "Titus", "Titus", "Tit", "TIT"),
    (57, "Phlm", "Philemon", "Phm", "PHM"), (58, "Heb", "Hebrews", "Heb", "HEB"),
    (59, "Jas", "James", "Jas", "JAS"), (60, "1Pet", "1 Peter", "1Pe", "1PE"),
    (61, "2Pet", "2 Peter", "2Pe", "2PE"), (62, "1John", "1 John", "1Jn", "1JN"),
    (63, "2John", "2 John", "2Jn", "2JN"), (64, "3John", "3 John", "3Jn", "3JN"),
    (65, "Jude", "Jude", "Jud", "JUD"), (66, "Rev", "Revelation", "Rev", "REV"),
]
BY_OSIS = {b[1]: b for b in BOOKS}
BY_STEP = {b[3]: b for b in BOOKS}
BY_USFM = {b[4]: b for b in BOOKS}
BY_INDEX = {b[0]: b for b in BOOKS}
BY_NAME = {b[2].lower(): b for b in BOOKS}
# names used by the scrollmapper CSV (SWORD style)
SWORD_NAMES = {
    "I Samuel": "1Sam", "II Samuel": "2Sam", "I Kings": "1Kgs", "II Kings": "2Kgs",
    "I Chronicles": "1Chr", "II Chronicles": "2Chr", "Song of Solomon": "Song",
    "I Corinthians": "1Cor", "II Corinthians": "2Cor", "I Thessalonians": "1Thess",
    "II Thessalonians": "2Thess", "I Timothy": "1Tim", "II Timothy": "2Tim",
    "I Peter": "1Pet", "II Peter": "2Pet", "I John": "1John", "II John": "2John",
    "III John": "3John", "Revelation of John": "Rev", "Psalms": "Ps",
}
NT_START = 40


def vid(book_index, chapter, verse):
    """Integer verse id: BBCCCVVV."""
    return book_index * 1000000 + chapter * 1000 + verse


def vid_parts(v):
    return v // 1000000, (v // 1000) % 1000, v % 1000


def osis_of(v):
    b, c, vv = vid_parts(v)
    return f"{BY_INDEX[b][1]}.{c}.{vv}"


def label_of(v):
    b, c, vv = vid_parts(v)
    return f"{BY_INDEX[b][2]} {c}:{vv}"


def parse_osis(ref):
    """'Gen.1.1' -> vid. Returns None when the book is unknown."""
    m = re.match(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$", ref.strip())
    if not m or m.group(1) not in BY_OSIS:
        return None
    return vid(BY_OSIS[m.group(1)][0], int(m.group(2)), int(m.group(3)))


def write_json(path, obj):
    full = os.path.join(DATA, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)
    return len(text.encode("utf-8"))


def read_json(path):
    with open(os.path.join(DATA, path), encoding="utf-8") as f:
        return json.load(f)


# ---------- Greek and Hebrew normalisation ----------

def strip_marks(s):
    """Remove all combining marks (accents, breathings, vowel points, cantillation)."""
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if not unicodedata.combining(ch))


GREEK_PUNCT = re.compile(r"[^\w]+", re.UNICODE)


def norm_greek(word):
    w = strip_marks(word).lower().replace("ς", "σ")
    w = w.replace("’", "").replace("'", "").replace("᾽", "").replace("ʼ", "")
    return GREEK_PUNCT.sub("", w)


HEB_FINALS = str.maketrans("ךםןףץ", "כמנפצ")


def heb_consonants(s):
    """Consonants only, finals folded, no maqaf or punctuation."""
    s = strip_marks(s)
    s = "".join(ch for ch in s if "א" <= ch <= "ת")
    return s.translate(HEB_FINALS)


def idf(n_docs, df):
    return math.log((n_docs + 1) / (df + 0.5))
