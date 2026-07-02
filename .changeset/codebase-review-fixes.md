---
"@brains/buttondown": patch
"@brains/content-pipeline": patch
"@brains/atproto": patch
"@brains/stock-photo": patch
"@brains/analytics": patch
"@brains/dashboard": patch
"@brains/a2a": patch
"@brains/discord": patch
"@brains/mcp": patch
"@brains/web-chat": patch
"@brains/webserver": patch
"@brains/chat": patch
"@brains/chat-repl": patch
"@brains/entity-service": patch
"@brains/job-queue": patch
"@brains/messaging-service": patch
"@brains/mcp-service": patch
"@brains/plugins": patch
"@brains/auth-service": patch
"@brains/note": patch
"@brains/document-plugin": patch
"@brains/content-formatters": patch
"@brains/atproto-contracts": patch
"@brains/site-engine": patch
"@brains/site-content": patch
"@brains/cms": patch
"@brains/rizom-ecosystem": patch
---

Codebase review fixes: validate A2A agent card endpoints before posting (SSRF guard); fail entity/embedding DB migration loudly at boot; report entity-not-found on update instead of phantom success; replace fake batch roots with explicit silent jobs; make broadcast dispatch concurrent; atomic JSON stores in auth-service with corrupt-file quarantine; honest buttondown duplicate detection and auto-send failure reporting; honest stock-photo cover status; MCP session idle eviction, dead handler removal, constant-time token compare; Discord typing indicator leak fix; note upload/generation id collision fixes; preserve zod error detail in structured content formatter; fold cms-config into cms plugin; remove dead packages (product-site-content, rizom-ui) and dead exports.
