---
"@rizom/site-docs": patch
"@rizom/site-rizom": patch
"@rizom/site-rizom-ai": patch
---

Declare preact as a peer dependency instead of a hard dependency. The external
site authoring contract has the host runtime provide preact; shipping it in
`dependencies` installed a second preact instance next to the host's. This
aligns the first-party site packages with the standalone reference canary.
