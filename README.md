# Threads

Threads is an offline-first Scripture study tool. It rests on the Hebrew, Aramaic and Greek texts and the ancient witnesses, shows everything in English, and traces every verse, link and variant on screen to a named dataset and an exact location. It shows evidence and its weight. It never hands down a verdict on doctrine.

Built for Barry Mossip, Roseisle Pentecostal Assembly, for preaching, teaching and writing.

## What it does

- **Read.** The Berean Standard Bible with every word tappable down to the Hebrew or Greek lemma beneath it, a literal line of word-by-word glosses, the original script one tap away, and the WEB and KJV on request. Hebrew verse numbers are noted wherever they differ from the English.
- **Web (Constellation view).** A passage sits at the centre with its Scripture links around it, typed as direct quotation, clear allusion, shared key lemma, typology or thematic echo. Each link has a deterministic score; tap it to see exactly how the score was built. Tier 2 to 4 witnesses (Septuagint, Dead Sea Scrolls, the Fathers) sit on a separate outer ring and never count toward a score.
- **Does the text bear it?** Type a claim. Offline, Threads searches Nave's and Torrey's topical indexes, the English and lemma indexes and the cross-reference graph, then reports supporting texts, tension texts, variant dependencies and tier warnings, ending with a plain-words weight summary. You can pin or remove texts by hand.
- **Word Threads.** Any word opens its lemma: gloss, Strong's number, lexicon entries (STEPBible brief, Brown-Driver-Briggs, Abbott-Smith, Thayer), every occurrence by book, its Septuagint equivalents and where it appears in the Dead Sea Scrolls.
- **Study trails.** Every step is recorded into a named trail you can annotate and export as Markdown, JSON, or a ME-WE-GOD-YOU-WE sermon skeleton whose GOD section is built from the trail. The other sections are left as headings for you.
- **Preset journey.** The Spirit thread: Numbers 11:29, Joel 2:28-32 in Hebrew and Septuagint, Ezekiel 36 and 37, Luke 24:49, Acts 2:1-21 against the Septuagint word by word, and the Community Rule's language of a holy spirit (Tier 3).

## Source tiers

| Tier | What | Used for |
|---|---|---|
| 1 Scripture | Hebrew and Aramaic Old Testament, Greek New Testament, with English | Authority |
| 2 Textual witnesses | Dead Sea Scrolls biblical manuscripts, Septuagint | What did the text say? |
| 3 Jewish background | Dead Sea Scrolls sectarian texts, Josephus' Antiquities | The world of the New Testament. Never presented as Scripture |
| 4 Early church | Ante-Nicene Fathers | Reception |

The rule is enforced in code: Tiers 2 to 4 can illuminate, confirm or complicate a reading, but never carry a claim alone. If they do, the claim test says so in plain words.

## AI-generated text

Text written by AI is always labelled "AI-generated" and drawn in a hatched, dashed box, apart from source data. It is never used in a score. In this build AI wrote: the five Dead Sea Scrolls variant notes (Deut 32:8, 1 Sam 10:27 to 11:1, Ps 145:13, Isa 53:11, Jeremiah in 4QJer-b), working translations of four Community Rule passages and of 4Q521 fragment 2 (the 'messianic apocalypse'), short reasons for some Spirit-thread links, and three journey notes. All of it is in `build/ai_content.json`.

## Sources and licenses

Every dataset is pinned to a commit in `build/sources.json`, which also records its license, attribution and the changes Threads makes. The About page is generated from it.

| Dataset | License |
|---|---|
| STEPBible-Data (TAHOT, TAGNT, TBESH, TBESG, TEHMC, TEGMC, TVTMS) | CC BY 4.0, Tyndale House and STEPBible.org |
| SBL Greek New Testament | CC BY 4.0 |
| Westminster Leningrad Codex with OSHB morphology | Public domain; OSHB CC BY 4.0 |
| MACULA Hebrew (Septuagint equivalents only) | CC BY 4.0 |
| Berean Standard Bible and its interlinear alignment | Public domain |
| World English Bible, King James Version | Public domain |
| Swete's Septuagint with Brenton's English | GPL-3.0 digital text; the editions are public domain |
| Dead Sea Scrolls (ETCBC/dss, Abegg) | **CC BY-NC 4.0, non-commercial** |
| Brown-Driver-Briggs (Open Scriptures) | Public domain; markup CC BY 4.0 |
| Abbott-Smith | Public domain |
| Thayer | Public domain; digital edition CC0 |
| OpenBible.info cross references | CC BY |
| Treasury of Scripture Knowledge (CrossWire) | Public domain |
| Nave's and Torrey's topical indexes | Public domain; structured data MIT |
| Ante-Nicene Fathers (CCEL ThML) | Public domain |
| Josephus, Antiquities (Whiston), Project Gutenberg #2848 | Public domain |

**Non-commercial.** Because the Dead Sea Scrolls layer is CC BY-NC 4.0, Threads must stay non-commercial while that layer is included.

**Left out on purpose.** MACULA's semantic domains come from the United Bible Societies ("used with permission" for Clear Bible), with no open license for others. Word Threads shows "no data" for semantic domain until that is resolved.

**Not in this build.** The Samaritan Pentateuch, Etheridge's Targums, Charles's 1 Enoch and Jubilees, Yonge's Philo and Lightfoot's Apostolic Fathers were not reachable from the build environment (see `not_available` in `build/sources.json`).

## Running it

Threads is a static site. Serve the folder with any web server and open it:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000/`. On a phone, open the GitHub Pages address and use "Add to Home Screen". To prepare for airplane mode, open Home and choose "Everything for airplane mode" while online.

The self-test page is `selftest.html`.

## Rebuilding the data

Requires Python 3.10 or later and git (with git-lfs, or network access to `media.githubusercontent.com`).

```
python3 build/fetch.py ../srcdata          # downloads every dataset at its pinned commit
export THREADS_SRC=../srcdata
python3 -I build/build_text.py             # English, Hebrew and Greek words, indexes
python3 -I build/build_lex.py              # lexicons and grammar codes
python3 -I build/build_dss.py              # scroll readings, comparison and lexeme index
python3 -I build/build_xref.py             # cross references, quotations and scores
python3 -I build/build_witnesses.py        # Septuagint, topical indexes, Fathers
python3 -I build/build_josephus.py         # Josephus, Antiquities
python3 -I build/build_markers.py          # negation and condition markers for the claim test
python3 -I build/build_meta.py             # sources, AI text, journeys, checks, file list
```

The MACULA Hebrew table is stored with Git LFS. If `git lfs` is not available, download it from `https://media.githubusercontent.com/media/Clear-Bible/macula-hebrew/<commit>/WLC/tsv/macula-hebrew.tsv` and check its SHA-256 against the LFS pointer.

Each build script writes a report (`build/report_*.json`) listing every mismatch its checks found. After rebuilding data, change `DATA` in `sw.js` (for example `threads-data-v2`) and the matching name in `app/views.js` so phones fetch the new files.

## Adding a dataset

1. Add an entry to `build/sources.json`: id, name, tier, repo, the full commit, the paths you need, license, license URL, attribution, the changes you make, and what it is used for. Read the license first; if it is unclear, do not add the data.
2. Run `python3 build/fetch.py ../srcdata <id>`.
3. Write or extend a build script that turns it into small JSON files under `data/`, keyed by English verse (`Book.json` with `"chapter:verse"` keys) wherever it attaches to verses.
4. Show it in the app with its tier badge and a citation line naming the dataset and the exact location.
5. Run `build_meta.py`, then open `selftest.html`.

## How link scores work

Score = Q + L + V + T, all from data:

- **Q, quotation**: the longest run of identical words a New Testament verse (SBLGNT) shares with the Septuagint (Swete) of an Old Testament verse; 10 points per word, maximum 60, counted when the run has 3 or more words and at least 2 content words.
- **L, shared lemmas**: for each lemma both passages share, its rarity weight ln(verses in corpus / verses using it); 2.5 points per unit, maximum 40. Old and New Testament verses are compared through the Septuagint equivalents in MACULA Hebrew.
- **V, OpenBible votes**: round(10 x log10(1 + votes)), maximum 30.
- **T, TSK**: 15 points when the Treasury of Scripture Knowledge lists the link.

Types: direct quotation (a 4-word or longer Septuagint run), clear allusion (a 3-word run, or 3 or more rare shared lemmas with votes or a TSK listing), typology (both passages in one typology entry of Nave's or Torrey's), shared key lemma, thematic echo.

## License for the Threads code

The Threads code (everything outside `data/` and `build/ai_content.json`) is offered under the MIT License. The data keeps the licenses listed above.
