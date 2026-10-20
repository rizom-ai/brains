---
"@rizom/brain": patch
---

An entity type can retire frontmatter fields it no longer uses. Stored entities carrying a retired field still load, and the brain removes the field from them on start, including from synced files. Blog posts retire `ogDescription`, `twitterCard` and `atprotoUri`, which nothing read; publishing a post to ATProto no longer writes its record URI back into the post.

Agents retire `cardObservedAt`, `cardLastCheckedAt`, `a2aEndpoint`, `did` (the agent page shows `brainDid`) and `anchorDid`. The card refresh loop now keeps its failure counts, unavailability and stale deadlines outside the agent, starting from the values the agent already carries.
