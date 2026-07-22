---
"@brains/atproto-contracts": patch
---

Validate ref-typed lexicon fields against their named object defs. The ref
restructure left `buildAtprotoFieldSchema` without a `ref` case, so nested
card/anchor/skill, post coverImage, and link source shapes fell through to
`z.unknown()` and untrusted discovery input passed record validation
unchecked. Local `#name` refs now resolve against `lexicon.defs`;
unresolvable refs fail closed.
