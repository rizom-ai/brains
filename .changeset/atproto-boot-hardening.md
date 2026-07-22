---
"@brains/atproto": patch
"@brains/atproto-contracts": patch
---

Harden atproto boot publishing and cross-version discovery. `ready()` now
schedules its card/lexicon publishes instead of awaiting them (an
unresponsive PDS can no longer stall startup), publishes only on a full boot
(startup-check mode stays side-effect free), and every PDS request carries a
30s timeout. Discovery converts cross-version anchor kinds
(`person`→`professional`, `organization`→`collective`) into the running
build's vocabulary via `normalizeDiscoveredBrainCard`, so the upcoming kind
rename cannot break card exchange between fleet versions.
