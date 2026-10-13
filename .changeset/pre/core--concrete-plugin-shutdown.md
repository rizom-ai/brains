---
"@brains/plugins": patch
---

Make the concrete BasePlugin shutdown method non-optional. Every subclass already inherits an implementation that awaits its onShutdown hook, with a no-op default. Concrete callers can now invoke cleanup directly; the general Plugin interface still permits independent implementations without shutdown.
