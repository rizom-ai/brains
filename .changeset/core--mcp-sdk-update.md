---
"@rizom/brain": patch
---

Update MCP client, core and server to 2.3.1 across existing consumers. Cover HTTP body and batch admission, required modern headers, redirect/token handling, repeated-cursor pagination and stdio EOF cleanup. Keep per-request authentication and permission-scoped servers, confirmation ownership and declarative authoring unchanged.

Retain the SDK's stricter defaults without redirect-follow or oversized-body overrides. Redirect hops are bounded per transport request, not per CLI operation; byte and page ceilings are not total memory, execution-time, spending or shutdown guarantees. No OAuth/DPoP rollout, hosted operation, release-version change or expansion of network Ask authority is included.
