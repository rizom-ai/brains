---
"@rizom/brain": patch
---

A message interface built on the public `MessageInterfacePlugin` now releases its progress tracking when it shuts down: pending delayed cleanup is interrupted and tracked progress events are cleared after the interface's own `onShutdown` runs.
