---
"@brains/document": patch
"@rizom/brain": patch
---

A PDF uploaded in chat and kept as a note gets its text again. The released brain ships as one bundled file, and pdf.js looked for its worker in a file next to it, so every PDF import failed with "Setting up fake worker failed". The worker now loads in the same process.
