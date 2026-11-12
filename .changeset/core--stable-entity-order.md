---
"@rizom/brain": patch
---

Entity listings now order deterministically: after the requested sort, entities that tie list by id, so lists, MCP resource reads, Studio collections and every page under a limit no longer depend on the order the store wrote them. Search results and nearest-neighbor reads with equal scores or distances list by id, then type; ranking is unchanged. Site data sources and dashboard widgets that sort in place (docs, guides, books, series, wishes, recent posts, RSS items, decisions, action items, recent conversation memory, topic distribution, publication failures) break their own ties the same way.
