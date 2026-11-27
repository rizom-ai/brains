---
"@brains/matrix-server": patch
"@rizom/brain": patch
---

Two brains that trust each other now share rooms in both directions, whichever grants trust first. Trusting a peer also joins the room the peer keeps for this brain, so an invite that arrived before this brain's grant, and was left pending, is taken up.
