---
"@rizom/brain": minor
---

Move HTTP listener ownership into the runtime. Finalized routes or static-site output activate one host; worker, eval and composition-check execution never binds it. Preview shares the production port, site-builder supplies authoritative serving paths, and shutdown drains/cancels HTTP work before releasing handler dependencies.

Breaking configuration migration: replace `plugins.webserver.productionPort` with top-level `port`, move supported serving settings to `http`, and remove unused preview/API port settings. The webserver plugin is no longer selectable. Canonical core retains MCP stdio and outbound-only A2A; web selects MCP HTTP and inbound A2A. Explicit protocol overrides win. ATProto reads runtime web exposure instead of plugin membership. Existing handler route admission and matching contracts are unchanged.

Correct pre-existing workspace dependency declarations and cyclic imports uncovered during validation: the built-in terminal uses the underlying plugin framework directly, and entity contract tests no longer depend back on AI-evaluation.
