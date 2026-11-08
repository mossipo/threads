# Build plan and risks

Written after the first build, because the process section of the specification arrived after the build had begun (see `DECISIONS.md`). It records the stages as they were done and the risks that shaped them.

## Stages

| Stage | Scope | State |
|---|---|---|
| 0 | Licenses checked for every dataset before bundling; sources pinned to commits in `build/sources.json` | Done |
| 1 | Acts and the Old Testament texts it uses: Hebrew, Greek, Septuagint, scroll witnesses; constellation, claim test, word threads, trails, both journeys | Done, together with stage 2 |
| 2 | The full canon | Done |
| 3 | Tier 3 and 4 libraries (scroll sectarian texts, Josephus, Ante-Nicene Fathers) and AI working translations | Partly: four Community Rule passages and 4Q521 fragment 2 are translated; 1 Enoch, Jubilees, Philo and Lightfoot were not reachable |
| Review | Self-test, review against the definition of done, independent 30-point spot-check, phone-use review | Self-test and spot-check done; phone-use review after the design pass |

## Risks and how each was handled

- **License terms.** The Dead Sea Scrolls data is CC BY-NC: Threads must stay non-commercial. UBS semantic domains have no open license and are left out. Swete's digital text is GPL-3.0 and kept in its own folder with the license.
- **Versification.** Hebrew, Greek, Septuagint and English numbering differ (Joel, Malachi, the Psalms, 3 John, Revelation 12 and 13). Mitigation: one English key per verse, other numbers carried alongside, and self-test checks against STEPBible's TVTMS.
- **Data alignment.** The BSB word tags, STEPBible's Hebrew and Greek, the SBLGNT and the scroll transcriptions were each matched with checks; every mismatch is written to `build/report_*.json` and summarised on the About page.
- **Quotation detection.** Septuagint word runs miss quotations made from the Hebrew. Mitigation: Nave's quotation list as a scored component.
- **Claim test.** A word search cannot read meaning. Mitigation: general rules (word families, predicates, quantifier scope, the cross-reference graph, chapter grouping), the evidence for every text shown, hand pins and removals, and never a verdict. Known gap: Gal 3:13 for the generational guilt claim.
- **Size and speed on phones.** 170 MB of data (about 42 MB compressed). Mitigation: per-book and per-chapter files, a service worker that stores what is used, and a download-everything option. Cached passages open in well under a second.
- **iOS storage.** Safari may clear site data that is not used for weeks; an installed home-screen app keeps it longer. Mitigation: backup and restore of everything the user creates.
