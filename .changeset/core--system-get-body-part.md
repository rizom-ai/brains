---
"@brains/core": patch
---

`system_get` accepts `part: "body"` to return the stored Markdown without its leading frontmatter, stripped by the host. A request to show or copy a note's body verbatim no longer depends on the model removing frontmatter correctly. The default (`full`) is unchanged.
