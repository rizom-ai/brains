---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/core": patch
"@brains/studio": patch
---

Add configurable, visibility-scoped virtual collections across entity types, with source-authoritative frontmatter membership, startup reprojection, and Studio browsing and editor return navigation. Multiple grouping fields and multiple values per field are supported without copying entities or changing file placement.

Notes use the normal frontmatter/Properties editor while their type participates in any registered grouping, including Notes with no membership. Notes without a grouping retain whole-document Markdown editing. Removing configuration preserves authored fields. Grouping inputs preserve literal commas and whitespace with explicit Enter/Add submission, mark spaces a reader could not otherwise see, and offer the values that already exist so exact matching does not fragment one group into several. Ordinary tag inputs and stored memberships are unchanged.

**Behaviour change for every frontmatter entity type:** ordinary frontmatter-form saves and entity exports now preserve existing unclaimed, non-policy frontmatter keys instead of dropping them, including inactive grouping fields. Preservation does not authorize arbitrary new form fields, and explicit full-source replacement remains authoritative. Field-update tools author registered extension fields in Markdown and show their actual previous source values in confirmation previews.

Each registered field is validated against its own schema entry, so frontmatter the entity owner rejects elsewhere in the document no longer removes an entity from its collections. The bounded startup pass runs on each serving start, including after register-only writes with grouping disabled or changed field constraints. Reusable owner fields are compared conservatively without dropping runtime checks. Failed suggestion refetches discard previously readable values, and the empty-value display marker cannot collide with a literal authored name.
