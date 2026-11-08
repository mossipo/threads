# Threads: status against the definition of done

8 November 2026.

| # | Definition of done | Status |
|---|---|---|
| 1 | Every verse, ancient text, cross-reference and variant on screen cites its dataset and exact location | Done. Every verse block, witness card, link panel, lexicon entry, edition flag and claim result carries a citation line. Scroll citations give the scroll, its siglum and Abegg's column or fragment and lines. |
| 2 | All AI text is labelled and styled differently | Done. AI text appears only in a hatched, dashed box labelled "AI-generated", set in the interface face, never the Scripture face. |
| 3 | The self-test page passes every acceptance test | 9 of 10 pass. The failure is honest: "Children bear their parents' guilt" does not surface Gal 3:13, because the data offers no principled path from that claim to it (see `DECISIONS.md`). 33 further checks also pass. |
| 4 | Installs as a PWA on Android and iOS and works in airplane mode | Done in headless Chrome: manifest, icons, service worker, app shell and fonts stored at install; a stored passage reloads with the network off. Not yet tried on a physical phone. |
| 5 | First meaningful screen under 3 s on a mid-range phone; cached passage under 1 s | Done in emulation (4x CPU slowdown, 4 Mbps, 150 ms latency): home in about 1.4 s; cached passages in 0.08 to 0.15 s. |
| 6 | Independent reviewer spot-checked 30 random data points; mismatches fixed or documented | Done: 29 matched; the one mismatch (Torrey's dashes) is fixed; see `docs/SPOTCHECK.md`. A second review (phone use and 10 new data points) is recorded in the final report. |
| 7 | GitHub repository under mossipo with Pages live and a README | Done: https://github.com/mossipo/threads, live at https://mossipo.github.io/threads/ (served from the `gh-pages` branch, which mirrors `main`). |

## Not in this build

- Datasets not reachable from the build environment: the Samaritan Pentateuch, Etheridge's Targums, Charles's 1 Enoch and Jubilees, Yonge's Philo, Lightfoot's Apostolic Fathers. Hand pins still carry their tiers.
- Ezra SIL font (Noto Serif Hebrew is bundled; Ezra SIL is used when installed).
- AI working translations exist for four Community Rule passages and 4Q521 fragment 2 only; AI link reasons for the Spirit thread only. Everything else shows that no AI text has been written.
- UBS semantic domains (no open license).
