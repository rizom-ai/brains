---
"@rizom/brain": patch
---

Harden generated deploy workflows by retrying Varlock resolution, masking resolved non-bootstrap values before exporting them to `$GITHUB_ENV`, preserving multiline values with heredoc syntax, and releasing stale Kamal deploy locks before deploy.
