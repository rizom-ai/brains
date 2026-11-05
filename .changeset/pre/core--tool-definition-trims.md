---
"@rizom/brain": patch
---

Saving a pasted document that starts with frontmatter no longer takes a failed attempt first: `system_create` now says the frontmatter `---` fences belong to the content, so the agent selects the document after the save instruction instead of treating the fences as delimiters. A first `system_create` or `system_update` request that fills in a user-message source hash is no longer refused as "changed after the proposal"; the hash is checked only when an approval is replayed. `system_analytics` names each report's params without repeating the report's description, which the tool description already carries, so every agent call sends about 200 fewer tokens.
