---
"@brains/auth-service": patch
"@rizom/brain": patch
---

Accept Claude Code and Claude Desktop as OAuth clients. Loopback redirect URIs declared without a port in a client ID metadata document now match any port, per RFC 8252 section 7.3, and grant types the server does not support are dropped from a metadata document instead of rejecting the whole document.
