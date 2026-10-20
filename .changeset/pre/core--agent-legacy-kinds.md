---
"@rizom/brain": patch
---

Agents saved before agent kinds were renamed on 22 July 2026 read again instead of being quarantined: a `professional` agent reads as a `person` and a `collective` as an `organization`, both when a file is imported and when a stored agent is parsed. A kind that was never valid is still refused.
