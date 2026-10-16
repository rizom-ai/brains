---
"@brains/atproto": patch
"@brains/atproto-contracts": patch
"@brains/blog": patch
---

Draft posts no longer reach the public PDS. AT Protocol projections can now say
whether a public entity is ready to publish, and the blog projection only
accepts published posts. Editing a draft used to push its full body to
`ai.rizom.brain.post`; the update now deletes any record a draft already leaked,
and the post is projected once the publish pipeline marks it published.
