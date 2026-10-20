---
"@brains/mcp": patch
"@rizom/brain": patch
---

Start modern Streamable HTTP responses in the SDK's SSE mode so its keepalive comments cover silent model/tool execution before the final result. This prevents that initial silence from exhausting a proxy's response-header timeout without increasing deployment timeouts. Authentication, confirmation handling, request cancellation, and stateless legacy compatibility remain unchanged.
