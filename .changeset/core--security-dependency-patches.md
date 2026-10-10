---
"@brains/a2a": patch
"@brains/email": patch
"@brains/directory-sync": patch
"@brains/mcp": patch
"@brains/webserver": patch
"@brains/unified-inbox": patch
"@brains/content-formatters": patch
"@brains/document": patch
"@brains/site-engine": patch
"@brains/ui-library": patch
"@brains/utils": patch
"@brains/ai-evaluation": patch
"@brains/mcp-service": patch
"@rizom/brain": patch
---

Raise compatible security-update minimums for the MCP client/server, Hono, PDF.js, JS-YAML, HTML sanitization, mail parsing and PostCSS. Refresh compatible vulnerable transitive dependencies, including nested JS-YAML, Seroval, Axios, Undici, DOMPurify, Mermaid, shell-quote and brace-expansion, without changing AI/Chat SDK versions, Effect pins or database dependencies.

Migrate the Git broker to simple-git 4.0.2's named export and patched argument parser. Preserve broker ownership, managed hook disabling and credential handling without enabling additional unsafe operations. Add controls for configuration includes, trailer commands, abbreviated executable options and explicitly supplied VISUAL editors.

This is not a clean-security-audit claim. Remaining advisories without compatible updates are not resolved by this patch.
