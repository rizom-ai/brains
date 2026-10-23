---
"@rizom/brain": patch
---

Each Brain process uses about 25–40 MB less memory at rest. The Git broker's RPC client now loads on first connection, so Effect's RPC, Schema and HTTP modules no longer run their load-time setup in the runtime bundle's top level, which had made JavaScriptCore compile that whole ~1.4M-instruction body in the supervisor, web and worker processes.
