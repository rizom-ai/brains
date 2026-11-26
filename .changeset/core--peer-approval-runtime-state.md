---
"@brains/agent-discovery": patch
"@brains/a2a": patch
"@brains/contracts": patch
"@rizom/brain": patch
---

Whether a brain may contact a peer is decided by runtime state, not by the peer's entry in the content repo. An agent's `status` shows the approval and no longer grants it: an entry edited to `approved` without one is put back to `discovered`, and the A2A client refuses the peer. Peers approved before this release keep their approval.

`agent_set_trust_level` becomes `agent_set_standing`, the one tool for a peer's standing in both directions: `contact` approves, restores or archives a peer, and `level` grants or revokes inbound trust as before. Approving or archiving through `system_update` no longer has any effect. Connecting a new peer and the Inbox's connect action record the approval the same way.

A brain serves the entities its owner marked `shared` to a peer it trusts, over a declared A2A extension (`https://rizom.ai/ext/entity-sharing/v1`): a signed `message/send` names one entity by type and id, and is answered before any model sees it. Every miss is the same `404`. An admin reads one with the new `agent_shared_entities` tool, whose `show` returns the entity's text and stores nothing.
