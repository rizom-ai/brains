---
"@brains/atproto-registry": minor
"@brains/sdk": minor
---

Migrate `@brains/atproto-registry` to the declarative surface. The plugin
class is deleted; its routes become `defineRoute` declarations and its tools
`defineTool` declarations.

**Three MCP tools are renamed.** `atproto-registry_list_lexicons`,
`atproto-registry_validate_lexicon` and `atproto-registry_check_contracts`
become `atproto-registry_list-lexicons`, `atproto-registry_validate-lexicon`
and `atproto-registry_check-contracts` — declared tool names are hyphenated.
Anything calling them by name breaks.

Services can declare HTTP routes now. The `routes` slot takes the same
`defineRoute` vocabulary interfaces use — security, body and response
validation included — converted by one shared runtime, so a route behaves
identically whichever family declares it. `defineRoute` is published on
`@rizom/brain/services` beside `defineTool`.
