---
"@brains/plugins": minor
"@brains/sdk": minor
---

Four reads a declared service can make about the process it runs in and the work it files, each with `@brains/directory-sync` as the named consumer:

- **`role`** on the setup context: `"scheduler"` or `"worker"`. The runtime already withholds operator bindings from a worker; a package whose own duties differ by role — one that reconciles a git checkout only where the scheduler runs, and must never open admission from a worker — reads which one it is in.
- **`gitBroker`** on the setup context: where the broker that owns the brain's checkout listens and where the checkout is, both undefined when the brain has no owner.
- **`health`**, a declaration slot: named operational health providers as a function of config and state. The runtime registers them under the package's id once registration completes in the scheduling role and releases them on shutdown; a worker reports nothing.
- **`enqueueBatch` and `batchStatus`** on the jobs handle: several declared jobs filed as one batch, so a sweep reports as one piece of work. Every operation names a job the package declared; the runtime scopes the names, sets the source, and links the children to the root the caller names when coordination began elsewhere.

The mock shell's job queue now files a batch as its child jobs and answers a batch status from them, where it answered a fixed completed status for any id.
