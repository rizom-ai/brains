# @brains/atproto-registry

Canonical Rizom AT Protocol lexicon registry plugin.

This plugin serves the `ai.rizom.brain.*` lexicons from the single in-repo source of truth in `@brains/atproto-contracts`.

Routes:

- `GET /atproto/lexicons/index.json`
- `GET /atproto/lexicons/<nsid>.json`

Tools:

- `atproto-registry_list_lexicons`
- `atproto-registry_validate_lexicon`
- `atproto-registry_check_contracts`

Intended deployment: enabled on the official `rizom.ai` brain/site as the public protocol registry. Publishing brains use `@brains/atproto` and local projections; they do not independently define `ai.rizom.brain.*` lexicons.
