---
"@rizom/brain": patch
---

A first-party service that keeps its class's plugin id may own several types, as a class that registered several types inside itself did: each installs under its own name, and the one named like the service under the plugin id the composer names for it.
