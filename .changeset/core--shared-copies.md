---
"@brains/agent-discovery": patch
"@brains/a2a": patch
"@brains/contracts": patch
"@brains/http-signatures": patch
"@rizom/brain": patch
---

A brain can keep a read-only copy of an entity a peer shares with it. `agent_shared_entities` gains `take`, which saves the copy after confirmation, and `drop`, which removes it. A copy is stored as its own `shared-copy` type, apart from the brain's own entities, and only when the document fits the brain's own schema for its type. It is readable by the brain's trusted users and never by the public, cannot be edited, is kept out of the content repo, and is never served onward.

The owner signs what it serves: the document's hash with its type, id and the time, using its A2A key. The asking brain refuses an answer whose hash or signature does not check out against the peer it asked, and keeps the signature with the copy.

A daily check keeps copies current. When the owner stops sharing an entity, its copy's text is erased and a stub stays with the title, the source and the signed hash; an unreachable owner changes nothing. Archiving a peer with `agent_set_standing` erases the copies taken from it, and its confirmation says how many.
