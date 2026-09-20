---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/core": patch
"@brains/studio": patch
---

Add configurable, visibility-scoped virtual collections across entity types, with source-authoritative frontmatter membership, startup reprojection, and Studio browsing and editor return navigation. Multiple grouping fields and multiple values per field are supported without copying entities or changing file placement.

Notes use the normal frontmatter/Properties editor while their type participates in any registered grouping, including Notes with no membership. Notes without a grouping retain whole-document Markdown editing. Removing configuration preserves authored fields. Grouping inputs preserve literal commas and whitespace with explicit Enter/Add submission; warnings and escaped display labels distinguish whitespace-sensitive values without changing ordinary tag inputs or stored memberships.

Ordinary frontmatter-form saves and entity exports now preserve existing unclaimed, non-policy frontmatter, including inactive grouping fields; preservation does not authorize arbitrary new form fields. Explicit full-source replacement remains authoritative. Field-update tools author registered extension fields in Markdown and show their actual previous source values in confirmation previews.
