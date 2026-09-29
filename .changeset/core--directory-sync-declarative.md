---
"@brains/directory-sync": minor
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": patch
"@rizom/ops": patch
---

Migrate `@brains/directory-sync` to the declarative surface, the last package on a base class. It is one `defineServicePlugin` importing `@brains/sdk` plus the shared libraries it already used; `DirectorySyncPlugin` and `directorySyncPlugin` are deleted, and the default export is the service a brain composes. The broker host entry points stay exported for the supervisor.

The mirror reads and writes every entity type through `entityMirror`, files its sweeps as batches of the eight jobs it declares, answers the bus through declared subscriptions, reports health through the `health` slot, and hosts its sync workspace through `studioWorkspaces`. Setup runs in both roles; only the scheduler reconciles the git checkout, watches files and dispatches exports.

Three more things the runtime had to offer, each with directory-sync as the named consumer:

- **`lifecycle.onRegistered`**: work to do once the package's own declarations are bound and before the brain announces registration. Setup runs before the runtime has read the `jobs` slot, so a setup that enqueues — reconciling inherited git work does — finds its own job unregistered; the hook runs after.
- **`dataDir`** on the setup context, and **`workspaceUrl`** in the subscriptions context, so a status answered over the bus can say where to manage what it reports.
- The mirror reaches the shell's entity service at the moment each call is made, as the class context did.

Three names changed with the runtime's scoping. The tool is `directory-sync_sync` (it was `directory_sync`); job types are `@brains/directory-sync:directory-sync:<job>`; and the package's runtime state is filed under its package name, so the operation status and the git reconciliation checkpoint a brain kept before this release are not found after it — the first sync runs a full reconciliation instead of an incremental one, and the operation history starts empty. The eval test cases and the ops stress reader name the tool and the jobs as the runtime does.
