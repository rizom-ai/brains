---
"@brains/mcp": patch
---

Drop `express`, `cors`, and `express-async-handler` — declared but never
imported. The MCP interface serves through the shared webserver; the Express
stack was left behind by an earlier transport and only widened every install.
