---
"@rizom/brain": patch
---

Entity listings now order deterministically: after the requested sort, entities that tie list by id, so lists, MCP resource reads, Studio collections and every page under a limit no longer depend on the order the store wrote them. Search results and nearest-neighbor reads with equal scores or distances list by id, then type; ranking is unchanged. Sorts that merge entities from several reads (the book theme strand, conversation memory recalled without a query, publication failures) break their own ties by id too; sorts over one listing keep its order for ties, most recently updated first.
