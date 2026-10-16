---
"@brains/entity-service": patch
---

Fix admitted shared and restricted entity deletions silently returning a lookup miss. The internal deletion transaction now loads its prior row across visibility tiers; caller-side authentication, visibility checks, and action permissions remain unchanged. This also removes the deleted entity from virtual-collection counts and membership immediately.
