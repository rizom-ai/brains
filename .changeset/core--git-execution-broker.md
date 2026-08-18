---
"@brains/directory-sync": patch
"@rizom/brain": patch
"@brains/core": patch
"@brains/plugins": patch
"@brains/app": patch
---

Own every managed Git operation in a supervised broker process.

Web and worker no longer execute Git. A broker owns each checkout, serializes
complete operations rather than individual commands, and is started before any
Git-capable role — so two processes can no longer interleave inside one commit.
The broker runs from a lightweight package-owned entrypoint instead of loading
a duplicate full Brain application bundle.
A lost Git completion fails closed: the operation stays owned and is never
retried or unlocked in place. The supervisor detects a wedged owner by
heartbeat silence or stale operation progress, terminates its process group,
and starts one replacement only after an OS probe proves that group absent;
when absence cannot be proven it exits the runtime for external cleanup rather
than risking a second writer.

Credentials are supplied per process and never persisted: a token configured in
a remote URL is separated from the address before anything logs, clones,
fingerprints, or configures `origin`, and inherited credential helpers are
refused. Managed operations run with repository hooks and automatic maintenance
disabled.
