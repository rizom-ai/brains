---
"@rizom/brain": patch
---

The runtime keeps no plugin class bases. `ServicePlugin`, `EntityPlugin`, `InterfacePlugin` and `MessageInterfacePlugin`, with their public wrappers and the `@brains/plugins/public/plugin-api` subpath, are gone; each declarative adapter registers through one internal core. A message interface's job progress, tool statuses and held-back completions run as before, through the coordinator every message interface owns.
