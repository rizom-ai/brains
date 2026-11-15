---
"@rizom/brain": patch
---

`brain assets:migrate` keeps its write-ahead log to one image's work while it runs. It holds the full-text index's automatic merges off during the run, so removing one image's search entry writes only that entry, then compacts the index in small separately committed steps instead of one `optimize`, and puts the index's merge settings back as it found them.
