# Independent data spot-check

A separate reviewer agent, which had not seen the build reasoning or the build code, drew 30 data points at random (seed 20261108) from the app's data and compared each with the upstream files. Its report follows unchanged.

**Follow-up by the builder (8 November 2026):**

- Mismatch 10.1 (Torrey's em dashes turned into colons, leaving ".:" in 21,581 entries): fixed. Torrey entries now keep their words, with each em dash shown as a spaced hyphen, the same rule as Josephus and the Fathers (see `build/sources.json`).
- Design point 3 (vote counts taken from the larger of the two OpenBible directions): Threads now stores both counts. The score panel shows the votes for each direction and says the score uses the larger.

---

# Threads data spot-check: 30 random data points

I checked 30 data points on 2026-11-08 as an independent reviewer. Built data came from `/home/claude/threads/data/` and upstream data from `/home/claude/srcdata/`. I did not open anything under `/home/claude/threads/build/` or `/home/claude/threads/app/`.

## Result

**29 MATCH, 1 MISMATCH. I completed all 30 checks.**

The one mismatch is the topical entry (check 10.1). The build rewrites Torrey's em dash separator as a colon. This happens throughout the Torrey data, not just in the sampled entry (see the final section).

Notation: this report contains no em dash characters. Where upstream data contains one, I write it as `[U+2014]`. In paths, `data/` means `/home/claude/threads/data/` and `src/` means `/home/claude/srcdata/`.

## Method

- I used Python 3.13.18 and ran every script as `python3 -I`.
- A single `random.Random(20261108)` drew the items for categories 1 to 10 in order. Each population was first listed in a fixed order: canonical book order, then chapter and verse numerically, then position. The draw can therefore be repeated, and nothing was hand-picked.
- Population sizes:
  - Checks 1 and 2: 31,105 verse entries in data/text.
  - Check 3: 305,648 OT words and 142,095 NT words in data/orig.
  - Check 4: 7,921 NT verses with a `g` line.
  - Check 5: 524,957 cross-reference links.
  - Check 6: 22,987 LXX verses.
  - Check 7: 11,165 DSS readings with at least one word not marked `r`.
  - Check 8: 22,717 STEPBible brief entries, and 10,994 Thayer or Abbott-Smith entries, in data/lex.
  - Check 9: 21,944 ANF index entries.
  - Check 10: 52,546 topical entries.
- Every comparison is exact string equality unless a note says otherwise.
- The scripts and the saved sample are in `/tmp/claude-0/-home-claude/06c9af20-64fb-5090-a187-d09cf34f9e37/scratchpad/sc/`:
  - `sample.py` draws the sample and writes `sample.json`.
  - `c1_bsb.py` to `c10_topic.py` run the checks.
  - `tf.py` reads the Text-Fabric files.

## 1. BSB verses (6)

App value: the first elements of `data/text/<Book>.json` `v[key].bsb`, joined together. Upstream: `src/openbible/formats/csv/BSB.csv`. None of the six is a Psalm verse 1, so the title split rule was not tested. The whitespace allowance was never needed.

**1.1 1 Chronicles 12:7**
- Checked: `data/text/1Chr.json` key `12:7` (6 segments)
- Upstream: BSB.csv line 10729 (`I Chronicles,12,7`)
- App: and Joelah and Zebadiah, the sons of Jeroham from Gedor.
- Upstream: and Joelah and Zebadiah, the sons of Jeroham from Gedor.
- **MATCH**: identical, character for character.

**1.2 Psalm 56:9**
- Checked: `data/text/Ps.json` key `56:9` (10 segments)
- Upstream: BSB.csv line 14766 (`Psalms,56,9`)
- App: Then my enemies will retreat on the day I cry for help. By this I will know that God is on my side.
- Upstream: Then my enemies will retreat on the day I cry for help. By this I will know that God is on my side.
- **MATCH**: identical. The interlinear file (`src/bsb/public/bsb-data/display/PSA/PSA56.json`, verse 9) reads "retreat. . . on" and "God [is] on". The app correctly uses the published wording instead.

**1.3 1 Samuel 4:13**
- Checked: `data/text/1Sam.json` key `4:13` (22 segments)
- Upstream: BSB.csv line 7312 (`I Samuel,4,13`)
- App: When he arrived, there was Eli, sitting on his chair beside the road and watching, because his heart trembled for the ark of God. When the man entered the city to give a report, the whole city cried out.
- Upstream: the same text.
- **MATCH**: identical.

**1.4 Ephesians 5:26**
- Checked: `data/text/Eph.json` key `5:26` (9 segments)
- Upstream: BSB.csv line 29332 (`Ephesians,5,26`)
- App: to sanctify her, cleansing her by the washing with water through the word,
- Upstream: the same text.
- **MATCH**: identical.

**1.5 2 Kings 9:15**
- Checked: `data/text/2Kgs.json` key `9:15` (25 segments)
- Upstream: BSB.csv line 9773 (`II Kings,9,15`)
- App: but King Joram had returned to Jezreel to recover from the wounds he had suffered at the hands of the Arameans in the battle against Hazael their king.) So Jehu said, “If you commanders wish to make me king, then do not let anyone escape from the city to go and tell it in Jezreel.”
- Upstream: the same text. The lone ")" also appears in the published text, where it closes a parenthesis opened in 9:14.
- **MATCH**: identical.

**1.6 Nehemiah 12:14**
- Checked: `data/text/Neh.json` key `12:14` (4 segments)
- Upstream: BSB.csv line 12640 (`Nehemiah,12,14`)
- App: of Malluchi, Jonathan; of Shebaniah, Joseph;
- Upstream: the same text.
- **MATCH**: identical.

## 2. WEB and KJV verses (4)

- WEB upstream: `src/openbibles/eng-web.usfx.xml`. I took the text between `<v id>` and `<ve/>` and removed `<f>` and `<x>` notes.
- KJV upstream: `src/openbibles/eng-kjv.osis.xml`. I took the text between the verse sID and eID milestones and removed the tags.
- None of the four verses has a footnote or a heading.

**2.1 WEB Isaiah 28:1**
- Checked: `data/text/Isa.json` key `28:1` field `web`
- Upstream: USFX book ISA, chapter 28, verse 1, line 26279
- App: Woe to the crown of pride of the drunkards of Ephraim, and to the fading flower of his glorious beauty, which is on the head of the fertile valley of those who are overcome with wine!
- Upstream: the same text.
- **MATCH**: identical.

**2.2 WEB Genesis 19:26**
- Checked: `data/text/Gen.json` key `19:26` field `web`
- Upstream: USFX book GEN, chapter 19, verse 26, line 597
- App: But his wife looked back from behind him, and she became a pillar of salt.
- Upstream: the same text.
- **MATCH**: identical.

**2.3 KJV Isaiah 16:12**
- Checked: `data/text/Isa.json` key `16:12` field `kjv`
- Upstream: OSIS `osisID="Isa.16.12"`, line 32798
- App: And it shall come to pass, when it is seen that Moab is weary on the high place, that he shall come to his sanctuary to pray; but he shall not prevail.
- Upstream: the same text.
- **MATCH**: identical.

**2.4 KJV Luke 2:6**
- Checked: `data/text/Luke.json` key `2:6` field `kjv`
- Upstream: OSIS `osisID="Luke.2.6"`, line 51128
- App: And so it was, that, while they were there, the days were accomplished that she should be delivered.
- Upstream: the same text.
- **MATCH**: identical.

## 3. Original-language words (4 OT, 3 NT)

- App: `data/orig/<Book>.json` `v[key].w[i]`. Here `i` counts from 0, so STEPBible word number = i + 1.
- Upstream: `src/stepbible/Translators Amalgamated OT+NT/TAHOT*.txt` and `TAGNT*.txt`.
- Values are shown as form | gloss | dStrong | grammar.
- For the Hebrew, I removed the `/` and `\` separators from the upstream form, and the instance mark from the upstream root dStrong (column 9), before comparing.
- In all seven verses, the app's word list also lines up one to one with the STEPBible lines for the whole verse. Transliteration and word type match as well.
- None of the four OT verses has a different Hebrew verse number.

**3.1 Ecclesiastes 3:21, word 2**
- Checked: `data/orig/Eccl.json` key `3:21` w[1]
- Upstream: TAHOT Job-Sng line 70161, `Ecc.3.21#02=L`
- App: יוֹדֵ֗עַ | [is] knowing | H3045 | HVqrmsa
- Upstream: יוֹדֵ֗עַ | [is] knowing | H3045 | HVqrmsa
- **MATCH**: all four fields identical.

**3.2 Leviticus 13:57, word 5**
- Checked: `data/orig/Lev.json` key `13:57` w[4]
- Upstream: TAHOT Gen-Deu line 74503, `Lev.13.57#05=L`
- App: אֽוֹ־ | or | H0176A | HC
- Upstream: `אֽוֹ\־` | or | H0176A_A (root column) | HC
- **MATCH**: identical once the `\` separator and the `_A` instance mark are removed, as the format describes.

**3.3 Ecclesiastes 2:25, word 1**
- Checked: `data/orig/Eccl.json` key `2:25` w[0]
- Upstream: TAHOT Job-Sng line 69672, `Ecc.2.25#01=L`
- App: כִּ֣י | for | H3588A | HTc
- Upstream: כִּ֣י | for | H3588A | HTc
- **MATCH**: identical.

**3.4 Numbers 16:34, word 8**
- Checked: `data/orig/Num.json` key `16:34` w[7]
- Upstream: TAHOT Gen-Deu line 100389, `Num.16.34#08=L`
- App: אָֽמְר֔וּ | they said | H0559 | HVqp3cp
- Upstream: אָֽמְר֔וּ | they said | H0559 | HVqp3cp
- **MATCH**: identical.

**3.5 Matthew 1:10, word 10**
- Checked: `data/orig/Matt.json` key `1:10` w[9]
- Upstream: TAGNT Mat-Jhn line 357, `Mat.1.10#10=N(k)O`
- App: Ἀμώς· | Amos; | G0301H | N-ASM-P
- Upstream: Ἀμώς· (Amōs) | Amos; | G0301H=N-ASM-P
- **MATCH**: identical. Three extra fields also match:
  - The meaning variant: "Ἀμών (t=Amōn) Amon - G0300=N-ASM-P in: TR+Byz".
  - The alternate Strong's number: G0300.
  - The editions: upstream lists NA28+NA27+Tyn+SBL+WH+Treg, and the app bitmask is 63 (bits 0 to 5). This confirms that NA28 is the lowest bit.

**3.6 1 Corinthians 12:13, word 6**
- Checked: `data/orig/1Cor.json` key `12:13` w[5]
- Upstream: TAGNT Act-Rev line 51667, `1Co.12.13#06=NKO`
- App: ἡμεῖς | we ourselves | G3165 | P-1NP
- Upstream: ἡμεῖς (hēmeis) | we ourselves | G3165=P-1NP
- **MATCH**: identical. The alternate Strong's number G2249 and the bitmask 255 (all eight editions) also match.

**3.7 Acts 16:26, word 11**
- Checked: `data/orig/Acts.json` key `16:26` w[10]
- Upstream: TAGNT Act-Rev line 18187, `Act.16.26#11=NKO`
- App: δεσμωτηρίου· | prison house; | G1201 | N-GSN
- Upstream: δεσμωτηρίου· (desmōtēriou) | prison house; | G1201=N-GSN
- **MATCH**: identical. The bitmask 255 matches the eight listed editions.

## 4. SBLGNT verse text (2)

**4.1 1 Corinthians 12:11**
- Checked: `data/orig/1Cor.json` key `12:11` field `g`
- Upstream: `src/sblgnt/data/sblgnt/text/1Cor.txt` line 283
- App: πάντα δὲ ταῦτα ἐνεργεῖ τὸ ἓν καὶ τὸ αὐτὸ πνεῦμα, διαιροῦν ἰδίᾳ ἑκάστῳ καθὼς βούλεται.
- Upstream: the same text with a trailing space. This verse has no critical signs.
- **MATCH**: identical apart from the trailing space.

**4.2 John 9:25**
- Checked: `data/orig/John.json` key `9:25` field `g`
- Upstream: `src/sblgnt/data/sblgnt/text/John.txt` line 421
- App: ἀπεκρίθη οὖν ἐκεῖνος· Εἰ ἁμαρτωλός ἐστιν οὐκ οἶδα· ἓν οἶδα ὅτι τυφλὸς ὢν ἄρτι βλέπω.
- Upstream: ἀπεκρίθη οὖν ⸀ἐκεῖνος· Εἰ ἁμαρτωλός ἐστιν οὐκ οἶδα· ἓν οἶδα ὅτι τυφλὸς ὢν ἄρτι βλέπω.
- **MATCH**: identical once the single critical sign ⸀ (U+2E00) is removed, which is the stated rule.

## 5. Cross-reference links (3)

- App link layout: [start, end, type, score, Q, L, V, T, lemmas, votes, quote].
- Upstream: `src/openbible/sources/extras/cross_references.txt` (OB below) and `src/tsk/data/tsk.ndjson` (TSK below).
- I recomputed V as round(10*log10(1+votes)), capped at 30.

**5.1 1 Timothy 2:5 to Hebrews 12:24**
- Checked: `data/xref/1Tim.json` key `2:5`, link 4 of 32: `[58012024, 58012024, "l", 58, 0, 30, 13, 15, ..., 19, null]`
- Upstream:
  - OB line 319461: `1Tim.2.5 Heb.12.24 19`.
  - Reverse row, OB line 329090: `Heb.12.24 1Tim.2.5 13`.
  - TSK line 29459 (1 Timothy 2:5, catchword "and") lists Heb.12.24.
  - TSK line 29999 (Hebrews 12:24, catchword "Jesus") lists 1Tim.2.5.
- App: votes 19, V 13, T 15
- Upstream: forward votes 19. 10*log10(20) = 13.0103, so V = 13. TSK lists the link in both directions, so T = 15.
- **MATCH**: votes, V and T are all correct.

**5.2 Judges 7:19 to Jeremiah 13:13-14**
- Checked: `data/xref/Judg.json` key `7:19`, link 6 of 17: `[24013013, 24013014, "l", 45, 0, 25, 5, 15, ..., 2, null]`
- Upstream:
  - OB line 53239: `Judg.7.19 Jer.13.13-Jer.13.14 2`. There is no reverse row.
  - TSK line 6308 (Judges 7:19, catchword "brake") lists Jer.13.13-Jer.13.14.
- App: target Jer 13:13 to 13:14, votes 2, V 5, T 15
- Upstream: the same range, votes 2. 10*log10(3) = 4.7712, so V = 5. TSK lists it, so T = 15.
- **MATCH**: range, votes, V and T are all correct.

**5.3 Isaiah 61:7 to Zechariah 9:12**
- Checked: `data/xref/Isa.json` key `61:7`, link 6 of 24: `[38009012, 38009012, "l", 46, 0, 16, 15, 15, ..., 32, null]`
- Upstream:
  - OB line 172727: `Isa.61.7 Zech.9.12 30`.
  - Reverse row, OB line 227307: `Zech.9.12 Isa.61.7 32`.
  - TSK line 18476 (Isaiah 61:7, catchword "your shame") lists Zech.9.12.
  - TSK line 22709 (Zechariah 9:12, catchword "I will") lists Isa.61.7.
- App: votes 32, V 15, T 15
- Upstream: forward votes 30, reverse votes 32. 10*log10(33) = 15.1851, so V = 15. (30 votes would also give V = 15, from 14.9136.) T = 15.
- **MATCH, with a note**: V and T are correct, and 32 is a real OpenBible count. But it comes from the reverse row; the forward row for this direction says 30. The build applies this rule consistently (see the final section), so I did not count it as a mismatch.

Not checked here because they were not part of the task: type, score, Q, L and the shared-lemma list.

## 6. Septuagint verses (2)

Upstream: `src/lxx/swete-greek-english-grid.tsv`.

**6.1 Nehemiah 5:2**
- Checked: `data/lxx/Neh.json` key `5:2`
- Upstream: grid line 12277 (`16 Neh 5 2`)
- App Greek: καὶ ἦσάν τινες λέγοντες Ἐν υἱοῖς ἡμῶν καὶ ἐν θυγατράσιν ἡμῶν ἡμεῖς πολλοί· καὶ λημψόμεθα σῖτον, καὶ φαγόμεθα καὶ ζησόμεθα.
- App Brenton: And some said, We are numerous with our sons and our daughters; so we will take corn, and eat, and live.
- Upstream: the same text in both columns.
- **MATCH**: Greek and English are identical. The app has no third element (Swete numbering), which fits: swete-greek.tsv also has this text at Neh 5:2.

**6.2 Zephaniah 1:17**
- Checked: `data/lxx/Zeph.json` key `1:17`
- Upstream: grid line 22648 (`36 Zep 1 17`)
- App Greek: καὶ ἐκθλίψω τοὺς ἀνθρώπους, καὶ πορεύσονται ὡς τυφλοί, ὅτι τῷ κυρίῳ ἐξήμαρτον· καὶ ἐκχεεῖ τὸ αἷμα αὐτῶν ὡς χοῦν, καὶ τὰς σάρκας αὐτῶν ὡς βόλβιτα·
- App Brenton: And I will greatly afflict the men, and they shall walk as blind men, because they have sinned against the Lord; therefore he shall pour out their blood as dust, and their flesh as dung.
- Upstream: the same text in both columns.
- **MATCH**: identical.

## 7. Dead Sea Scrolls readings (2)

Upstream: `src/dss/tf/2.0.4/`. I used otype, oslots, glyph, type, rec, after, book, chapter and verse, plus scroll, fragment and line, which are stored on line nodes.

How I compared:
- In Text-Fabric, one written word can be split into several word nodes. Prefixes such as ו ה ב ל have no space after them, and a geresh sign of type `sep` marks a suffix boundary.
- I rebuilt each written word as a run of word nodes ending at a space, and took its consonant signs.
- A word counts as reconstructed when every consonant has rec=1, and as partly reconstructed when only some do.
- My first pass compared raw word nodes and showed false differences. Comparing whole written words is the correct method.

**7.1 Isaiah 1:14, scroll Mur3**
- Checked: `data/dss/bib/Isa.json` key `1:14`, reading 3 of 3 (1Qisaa, 4Q60, Mur3)
- Upstream: TF word nodes 2090956 to 2090967 (book `Is`, chapter 1, verse 14), on scroll Mur3, fragment f1, lines 20 and 21
- App:
  - Not reconstructed: נפשי (status s, partial flag 1).
  - Reconstructed: חדשיכם ומועדיכם שנאה היו עלי לטרח נלאיתי נשא.
  - Locations: f1:20, f1:21.
- Upstream:
  - Not reconstructed: נפשי (נ פ ש visible, final י rec=1, so partly reconstructed).
  - Reconstructed: the same 8 words.
  - Lines: f1:20, f1:21.
- **MATCH**: the letters, word order, partial flag, reconstructed words and line locations are all identical.

**7.2 Genesis 1:1, scroll 4Q7**
- Checked: `data/dss/bib/Gen.json` key `1:1`, reading 2 of 3 (4Q2, 4Q7, 4Q8d)
- Upstream: TF word nodes 1940279 to 1940290 (book `Gen`, chapter 1, verse 1), on scroll 4Q7, fragment f1, line 1
- App:
  - Not reconstructed: בראשית (partial), אלהים, את, השמים, ואת, הארץ.
  - Reconstructed: ברא.
  - Location: f1:1.
- Upstream:
  - Not reconstructed: בראשית (ב ר א ש visible, י ת rec=1, so partly reconstructed), אלהים, את, השמים, ואת, הארץ.
  - Reconstructed: ברא.
  - Line: f1:1.
- **MATCH**: identical.

Not checked, because the task asked only for the letters of non-reconstructed words: the s/o/c/d/p statuses against the Masoretic text, the glosses and the Masoretic index numbers.

## 8. Lexicon entries (2)

**8.1 STEPBible brief entry H2152**
- Checked: `data/lex/H8.json` key `H2152`, `d.H2152`
- Upstream: `src/stepbible/Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt` line 2954
- App: l זַלְעָפָה, t zal.a.phah, m H:N-F, g scorching, x "burning heat, raging heat"
- Upstream: `H2152 | H2152 = | H2152 | זַלְעָפָה | zal.a.phah | H:N-F | scorching | burning heat, raging heat`
- **MATCH**: all five fields identical.

**8.2 Thayer entry G4756 (στρατιά)**
- Checked: `data/lex/G19.json` key `G4756` field `th`
- Upstream: `src/thayer/book/23-G4534-G4782.md`. The entry marked `Strong's G4756` is at line 2010, and its body runs from line 2012 to 2022.
- App: 6 `<p>` paragraphs with no text outside them. The first reads: "στρατιά, στρατιᾶς, ἡ (στρατός (cf. στρατεύω)), from Aeschylus and Herodotus down, the Sept. for צָבָא;"
- Upstream: 6 paragraphs, the first identical to the one above.
- **MATCH**: with the tags removed, each of the 6 paragraphs is identical to its upstream paragraph.

## 9. Ante-Nicene Fathers reference (1)

**9.1 Mark 3:11**
- Checked: `data/anf/idx/Mark.json` key `3:11`, its only entry `["09", "iv.iii.viii-p26", 771]`, and `data/anf/p/09.json` key `iv.iii.viii-p26` (labels "The Diatessaron of Tatian.", "The Diatessaron.", "Section VIII.")
- Upstream: `src/anf/sources/xml/anf09.xml`. Paragraph `id="iv.iii.viii-p26"` starts at line 3440. Its endnote n="625", at line 3467, holds `<scripRef id="iv.iii.viii-p37.1" osisRef="Bible:Mark.3.11">Mark iii. 11</scripRef>`. The note is anchored just before "as soon as they beheld him, would fall, and [15] cry out, and say, Thou art the Son of God."
- App: the paragraph is indexed to Mark 3:11, at character offset 771.
- Upstream: the paragraph has an editor's note with a scripRef to Mark.3.11.
- **MATCH**: the reference is genuine. Three extra checks also passed:
  - The stored text equals the source paragraph with the notes removed and whitespace collapsed.
  - Offset 771 is exactly where that note's anchor falls.
  - The three labels equal the titles of the enclosing div1, div2 and div3 elements.

## 10. Topical entry (1)

**10.1 Torrey, "Parents", entry 37**
- Checked: `data/topics/e/14.json` key `torrey:parents`, entry 37 of 49 (index 36)
- Upstream:
  - `src/topical/dist/torrey/entries.jsonl` line 14564 (id `torrey:parents:entry:00037:9cfc9f30`, entryIndex 37).
  - `assertions.jsonl` lines 24250 and 24251.
- App: text `David.: 2Sa 18:5,33.`, ranges [[10018005,10018005],[10018033,10018033]]
- Upstream: rawText `David. [U+2014] 2Sa 18:5,33.` The assertions give 2 Samuel 18:5 and 2 Samuel 18:33, both source_valid.
- **MISMATCH (text)**: the references are correct, but the build replaced " [U+2014] " with ": ". That leaves a doubled ".:" in the text. The same rewrite runs through the whole Torrey data (see below).

## Mismatches and systematic problems

1. **Mismatch, check 10.1** (`data/topics/e/14.json`, `torrey:parents` entry 37). The app shows "David.: 2Sa 18:5,33." where Torrey has "David. [U+2014] 2Sa 18:5,33.". The references are correct.

2. **Systematic problem: every em dash in Torrey's text becomes a colon.**
   - Of the 52,546 built topical entries, 30,965 match the upstream rawText exactly.
   - The other 21,581 are exactly the upstream entries whose rawText contains an em dash. All of them are Torrey entries; Nave has no em dashes.
   - In every one, the em dash became a colon:
     - 21,580 entries had " [U+2014] " replaced with ": ".
     - 1 entry has no space after the dash upstream: `Israel. [U+2014]Ex 4:22; Ho 11:1; Ro 9:4.` became `Israel.: Ex 4:22; Ho 11:1; Ro 9:4.`.
   - In 13,132 of these entries the text before the dash ends in a full stop, so the app now shows ".:". Examples: `Voracious.: Da 7:5.` and `Cunning.: La 3:10.`.
   - No references are affected.
   - Bible text is not affected. The app keeps the same number of em dashes as upstream in the BSB (1,672 against 1,672), the SBLGNT (93 against 93) and Brenton (151 against 151).

   The pattern looks like a deliberate rule that removes em dashes from everything except Scripture. If that is intended, the rewrite should also drop the full stop before the dash, or use a different separator. Either way, the topical text is no longer a verbatim copy of Torrey.

3. **Design point to confirm (not counted as a mismatch): cross-reference vote counts are the same in both directions.** I checked all 63 links with votes in the three sampled source verses. In every one, the stored count is the larger of the forward and reverse OpenBible counts:

   | Case | Links |
   |---|---|
   | Forward row only | 27 |
   | Reverse row only (OpenBible lists the link only from the other verse) | 22 |
   | Both rows, forward larger | 9 |
   | Both rows, reverse larger | 4 |
   | Both rows, equal | 1 |

   V and T were correct on all 73 links of those verses, including V = 0 where votes are null. Suppose the app presents the number as OpenBible's votes for the direction shown. Then 26 of these 63 links (22 + 4) show a count that OpenBible gives only for the opposite direction. Check 5.3 is one of them: it shows 32, but OpenBible has 30 for that direction.

4. **Note for anyone re-running check 7 (not a data problem).** A plain comparison against raw Text-Fabric word nodes shows false differences in DSS readings, because the words are split at prefixes and suffix markers. Compare whole written words, as described in section 7.

**Final count: 29 MATCH, 1 MISMATCH, 0 not checked.**
