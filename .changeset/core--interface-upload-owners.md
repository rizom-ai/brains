---
"@brains/plugins": minor
"@brains/sdk": minor
"@rizom/brain": minor
---

Isolate temporary interface uploads by package, declaration ID, and local namespace. Use a fixed-length SHA-256 directory name derived from the owner tuple, preserving flat-path validation without filesystem name-length failures for long owners.

This alpha change intentionally stops resolving existing temporary upload references, including web-chat attachments; re-upload files if needed. It adds no migration or legacy fallback. Old upload directories remain untouched and are not pruned by new scopes. Saved image entities retain their embedded bytes. Reference shapes, routes, retention settings, and state namespaces are unchanged.

Add public SDK scope checks, filesystem-backed save/read/remove/prune/restart regressions for all interface-family combinations, and updated web-chat/Discord/Slack integration fixtures.
