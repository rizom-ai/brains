---
"@rizom/brain": patch
---

Contain generated deployment, canonical development, and one-shot runner process trees with Bun's `--no-orphans` flag. Existing graceful signal forwarding, runtime drain order, and Git process-group ownership remain authoritative; the flag only handles abrupt parent loss and descendants left after normal shutdown.
