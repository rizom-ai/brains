---
"@brains/utils": patch
"@rizom/brain": patch
---

Resolve directory-sync environment references inside the dedicated Git broker process before broker host startup.

Packaged deployments can continue to keep the remote credential in `GIT_SYNC_TOKEN`: the broker resolves the configured reference from its inherited environment, retains the credential only in broker memory, and injects it into each Git network child without persisting it or sending it over the broker protocol.
