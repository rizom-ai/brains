---
"@brains/atproto-contracts": patch
"@brains/atproto": patch
---

Reject record fields the lexicon does not declare.

Record schemas were built with `.passthrough()` and strictness was reinstated
for `ai.rizom.brain.card` alone, through a hardcoded list of allowed field names
that duplicated the card lexicon. Eight of the nine canonical records therefore
accepted and retained arbitrary undeclared fields, and adding a property to the
card lexicon without editing that list would have made valid records fail.

Strictness now comes from each lexicon's own property set, so it covers nested
objects and any lexicon added later. `refineBrainCardRecord` and its field lists
are gone.

Publishing a record carrying a field its lexicon does not declare now fails
locally instead of reaching the PDS. The canonical projections were checked and
already conform; only a narrow test stub did not.
