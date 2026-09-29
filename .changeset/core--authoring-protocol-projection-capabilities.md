---
"@brains/plugins": patch
"@brains/core": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

Expose a frozen, bound MCP transport view to interface setup instead of the full MCP service. Preserve the declared server factories, permission/protocol controls, and optional anchor operation without exposing registration, backing registries, or the message bus. The returned protocol SDK server remains an intentional transport capability.

Give plugin callbacks frozen snapshots of configured spaces rather than the deployment's mutable array.

Project entity derivation contexts into their declared entity/conversation readers, space snapshots, AI operations, and logger methods. Share the adapters between core and the declaration helper so directly supplied executable rules and direct helper calls both respect the boundary. Preserve lazy access to unused execution dependencies.

Add real MCP/core runtime regressions, worker callback checks, and source/built/packed public SDK coverage. No persisted state keys or migration behavior change.
