# @brains/atproto-registry

Canonical Rizom AT Protocol lexicon registry plugin.

This plugin serves the `ai.rizom.brain.*` lexicons and registry metadata from the single in-repo source of truth in `@brains/atproto-contracts`.

Routes:

- `GET /atproto/lexicons/index.json` — manifest with NSID, route, status, version/revision, steward, projection package, and compatibility notes
- `GET /atproto/lexicons/<nsid>.json` — canonical lexicon JSON

Tools:

- `atproto-registry_list_lexicons`
- `atproto-registry_validate_lexicon`
- `atproto-registry_check_contracts`

Intended deployment: enabled on the official `rizom.ai` brain/site as the public protocol registry. Ranger exposes this plugin as an opt-in capability, but it is not included in the default preset. Publishing brains use `@brains/atproto` and local projections; they do not independently define `ai.rizom.brain.*` lexicons.
