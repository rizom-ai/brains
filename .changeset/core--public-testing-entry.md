---
"@brains/sdk": minor
"@rizom/brain": minor
---

An author can test a package without booting a brain

Every package in this repository tests through the runtime's own harness, which
an external author cannot import. The only way to exercise a published package
was to install it into a packed brain and drive that — a slow way to learn that
a tool returns the wrong shape.

`@rizom/brain/testing` is that harness, narrowed. `createBrainTestHarness()`
installs what a package exports, seeds records, asks over the bus, and calls a
declared tool, which answers with its data or throws.

Narrowed further than it first looks necessary: the internal harness hands back
the runtime's `Plugin`, `PluginCapabilities` and `Template`, and each reaches the
shell, the queue or the entity service. Publishing them would put the runtime in
the declarations of the one entry whose purpose is to keep authors out of it. The
published-surface test now holds this entry to that rule.
