---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/core": patch
"@brains/templates": patch
"@brains/studio": patch
"@brains/directory-sync": patch
"@brains/app-ui-react": patch
"@rizom/brain": patch
---

A registered entity type can now carry its own `actionPolicy` floor, so an admin-only type stays admin-only in a brain assembled without the bundle carrying its rule. Each action preserves the stricter of the type's minimum and the wildcard policy, including `never`; an explicit per-type entry still overrides the result. Primary buttons keep a visible hover cue when motion is reduced. System forms omit empty field sections, including the Groupings reader's empty Access section.

Add admin-managed grouping vocabularies in Studio's System → Structure area. Admins can close a grouping to an exact list of values and choose single or multiple membership without restarting. Trusted editors choose from dropdowns or checkboxes; open groupings keep literal input. The vocabulary is always shared so the editors it constrains can read it. Create/update persistence enforces closed lists across Studio, tools, MCP and imports.

**Derived projection upserts are now validated.** They previously wrote without owner validation or persist validators; they now reconstruct the adapter's fields, project membership from the full source, and run both inside the admitted rule transaction. A rule can no longer write an entity its own type would reject, and supplied metadata cannot invent membership the source does not carry. A refusal rolls back the entire rule result, including export intents and ownership claims, and completed rule reports stay idempotent. Queued directory imports and cleanup retain their durable batch identity through the active-service facade rather than attempting to open unrelated nested batches. Policy-refused imports fail without quarantining valid source. Existing out-of-list values stay visible and marked, never rewritten. Persist validators compose with owner constraints instead of replacing them. Validation field issues survive separate runtime/plugin module copies. Primary buttons retain their contrast-tested colors on hover, and membership warnings stay visible on phones.

Add configurable, visibility-scoped virtual collections across entity types, with source-authoritative frontmatter membership, startup reprojection, and Studio browsing and editor return navigation. Multiple grouping fields and multiple values per field are supported without copying entities or changing file placement.

Notes use the normal frontmatter/Properties editor while their type participates in any registered grouping, including Notes with no membership. Notes without a grouping retain whole-document Markdown editing. Removing configuration preserves authored fields. Grouping inputs preserve literal commas and whitespace with explicit Enter/Add submission, mark spaces a reader could not otherwise see, and offer the values that already exist so exact matching does not fragment one group into several. Ordinary tag inputs and stored memberships are unchanged.

**Behaviour change for every frontmatter entity type:** ordinary frontmatter-form saves and entity exports now preserve existing unclaimed, non-policy frontmatter keys instead of dropping them, including inactive grouping fields. Preservation does not authorize arbitrary new form fields, and explicit full-source replacement remains authoritative. Field-update tools author registered extension fields in Markdown and show their actual previous source values in confirmation previews.

Each registered field is validated against its own schema entry, so frontmatter the entity owner rejects elsewhere in the document no longer removes an entity from its collections. The bounded startup pass runs on each serving start, including after register-only writes with grouping disabled or changed field constraints. Reusable owner fields are compared conservatively without dropping runtime checks. Failed suggestion refetches discard previously readable values, and the empty-value display marker cannot collide with a literal authored name.
