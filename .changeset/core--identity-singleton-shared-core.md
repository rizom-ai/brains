---
"@brains/identity-service": patch
---

Share the singleton-document core between the identity services.

`AnchorProfileService`/`BrainCharacterService` and their adapters were the same
code with the nouns renamed: each service re-wired an adapter into
`SingletonEntityService` by hand, and each adapter carried its own copy of the
frontmatter-regeneration override. The wiring now lives once in
`SingletonDocumentService` (parse/create delegate to a codec, bootstrap scope
applied in one place) and `SingletonFrontmatterAdapter` (frontmatter regenerated
from content, where these singletons keep their truth). The domain classes keep
their consumed surface — defaults, factories, and named getters — unchanged.
