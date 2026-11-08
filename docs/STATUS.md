# Threads: status against the definition of done

First build, 8 November 2026.

| # | Definition of done | Status |
|---|---|---|
| 1 | Every verse, ancient text, cross-reference and variant on screen cites its dataset and exact location | Done. Every verse block, witness card, link panel, lexicon entry and claim result carries a citation line naming the dataset and location, with a link to the source details. Checked by the self-test (every verse in a rendered passage has a citation). |
| 2 | Every AI-generated piece of text is labelled and styled differently | Done. AI text appears only inside a dashed, hatched box labelled "AI-generated". |
| 3 | The self-test page passes every check in `<acceptance_tests>` | Partly. The acceptance test list was missing from the specification. `selftest.html` runs 29 checks written from the specification; all pass. Replace or extend them when the list arrives. |
| 4 | Installs as a PWA on Android or iOS and works in airplane mode | Done in testing (headless Chrome): manifest, icons and service worker in place; a stored passage reloads with the network off. Not yet tried on a physical phone. |
| 5 | First meaningful screen within 3 seconds on a mid-range phone; cached passage within 1 second | Done in emulation: home screen in about 1.2 s with a 4x CPU slowdown on a 4 Mbps, 150 ms connection; cached passages in under 0.11 s. |
| 6 | An independent reviewer spot-checked 30 random data points against upstream; mismatches fixed or documented | See `docs/SPOTCHECK.md`. |
| 7 | GitHub repository under mossipo with Pages live and a README | Waiting on access: the repository and README are ready locally; pushing needs Barry to create or approve `mossipo/threads`. |

## Still to do

- Barry's acceptance tests and preset journey 5b (the specification was cut off).
- Datasets that were not reachable: Etheridge's Targums, Charles's 1 Enoch and Jubilees, Yonge's Philo, Lightfoot's Apostolic Fathers, the Samaritan Pentateuch.
- AI link reasons exist for the Spirit thread only; working translations exist for four Community Rule passages only. Everything else shows that no AI text has been written.
- The UBS semantic domains stay out until their license is settled.
