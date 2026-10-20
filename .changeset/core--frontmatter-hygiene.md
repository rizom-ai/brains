---
"@rizom/brain": patch
---

An entity type can retire frontmatter fields it no longer uses. Stored entities carrying a retired field still load, and the brain removes the field from them on start, including from synced files. Blog posts retire `ogDescription`, `twitterCard` and `atprotoUri`, which nothing read; publishing a post to ATProto no longer writes its record URI back into the post.
