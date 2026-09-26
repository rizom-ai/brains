---
"@rizom/brain": patch
---

Guest chat turns now settle their actual cost. The guest turn budget records the usage the provider reported for every model call (input, cached, cache-write and output tokens, reasoning included) and every query embedding, and the OpenAI guest profile prices it at a pinned revision of the published gpt-5.6-luna and text-embedding-3-small rates, charging requests over 272K input tokens at the long-context rates throughout. The settlement travels on the agent response as `guestSettlement` and is kept in the owner's usage record with the turn's outcome. A turn whose usage is missing, a long-context request with cached input (whose rate is not published), or an accounting without pricing is recorded as unknown cost, never as zero; quotes are never recorded as cost.
