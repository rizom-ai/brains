---
"@rizom/brain": patch
---

Fix `brain init --deploy` to scaffold a checked-in `scripts/extract-brain-config.rb` helper and use it from the deploy workflow instead of shell-grepping `brain.yaml`. This also avoids broken newline escaping in the generated workflow's inline Node snippets.
