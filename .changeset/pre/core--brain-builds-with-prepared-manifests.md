---
"@rizom/brain": patch
"@rizom/brain-ui": patch
"@brains/build-tools": patch
---

The brain builds while a core release has the publish manifests prepared. The release prepares every core-lane publish manifest before `changeset publish` and restores them afterwards, so `@rizom/brain`'s `prepublishOnly` build ran while `@rizom/brain-ui` exported only its published entry, and the entity templates' `@rizom/brain-ui/internal` imports no longer resolved. The alpha.649 release published `@rizom/brain-ui` and `@rizom/ops` but not `@rizom/brain`, so `@rizom/brain@0.2.0-alpha.649` will never exist; this release republishes the core group. The brain's bundle now reads first-party workspace packages from the exports their source declares, whatever state their manifest is in, and the packed compatibility run builds and packs the brain with the core-lane manifests prepared, as the release does.
