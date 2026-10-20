---
"@brains/atproto-contracts": patch
---

Restructure the card, link, and post lexicons to hoist inline nested objects into named defs referenced via `type: "ref"`, making every canonical lexicon valid under the official AT Protocol lexicon parser (third-party viewers rejected the published schemas as invalid), and gate spec validity with an `@atproto/lexicon` conformance test.
