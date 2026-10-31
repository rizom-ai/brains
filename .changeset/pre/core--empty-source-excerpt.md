---
"@rizom/brain": patch
---

Asking a brain about an entity whose content is all frontmatter, such as its style guide, now returns the answer. Before, the citation for that entity carried an empty excerpt, which broke the response contract and turned the whole chat reply over MCP or web chat into a validation error. A citation with nothing to quote now has no excerpt, and a malformed card is left out of a reply instead of failing it.
