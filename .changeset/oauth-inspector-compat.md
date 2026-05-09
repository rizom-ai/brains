---
"@brains/auth-service": patch
"@brains/mcp": patch
---

Improve MCP Inspector OAuth compatibility by allowing browser CORS preflights on OAuth machine endpoints, accepting MCP protocol headers in CORS responses, tolerating loopback redirect URI variations, preserving registered client scopes when authorize requests omit scope, and handling raw WebCrypto ECDSA signatures.
