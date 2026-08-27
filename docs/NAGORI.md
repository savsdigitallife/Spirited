# Nagori — design bible

Design documentation for **Nagori**, an original Japanese fantasy action RPG and
rural life sim. This is a *design* deliverable only — nothing in it is
implemented, and no code in this repository is written against it.

- **Read it:** `nagori-design-bible.html` (open in a browser)
- **Published:** https://claude.ai/code/artifact/acc13b53-7c4c-44e6-9f85-395356b15c45

The source is kept here so the document can be edited and re-published later;
the published artifact is the read-only copy.

## Relationship to this repository

This repo currently holds *Spirited* — a browser WebGL2 prototype (~8,800 lines,
34 tests). Nagori is a separate, larger project and the bible recommends Unity
for it. The prototype's proposed role is a headless **systems sandbox** for
tuning data — Cadence accrual curves, the farming calendar, the economy — which
ports to a real engine as JSON. See §14 of the bible.

Four decisions are outstanding before any implementation begins: engine, scope,
what gets built first, and any changes to the design itself.
