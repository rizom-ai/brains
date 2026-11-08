---
"@rizom/brain": patch
---

The AT Protocol lexicon registry is a declarative service. It serves the same public `/atproto/lexicons/index.json` and `/atproto/lexicons/<nsid>.json` routes, unchanged, under the same `atproto-registry` plugin, with the same `atproto-registry_list_lexicons`, `atproto-registry_validate_lexicon` and `atproto-registry_check_contracts` tools. The tools now declare that they only read, so MCP clients see them as read-only, and validating against an unknown lexicon is refused with the `not_found` code beside its message.
