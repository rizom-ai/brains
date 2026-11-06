---
"@brains/entity-service": patch
"@brains/plugins": patch
"@brains/chat": patch
"@brains/social-media": patch
"@brains/content-pipeline": patch
"@brains/blog": patch
"@brains/atproto-contracts": patch
---

Readers that need image bytes now read them explicitly instead of relying on data-URL materialization. `readArtifactContent` returns an artifact's bytes from inline storage or its stored asset, refusing an oversized asset from its recorded size before loading it; chat and message-interface native delivery, LinkedIn/social publishing, content-pipeline publishing and the blog's AT Protocol cover upload use it, and their lookups read asset references. The entity service counts remaining legacy data-URL materializations by method and entity type (`getLegacyBinaryMaterializations`) and logs them without content.
