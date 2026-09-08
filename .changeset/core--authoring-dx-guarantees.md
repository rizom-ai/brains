---
"@brains/sdk": minor
"@brains/plugins": minor
"@brains/runtime-state": minor
"@brains/mcp-service": patch
"@rizom/brain": minor
---

Bind declarative tool confirmations to their prepared input so replay cannot
repeat schema transforms or generated defaults. Keep prepared values within the
existing bounded, expiring, single-use confirmation store.

Preserve confirmation details and enforce production tool permissions in the
public testing harness. Roll back every newly installed child of a failed
compound package without discarding previously installed packages.

Separate durable-state write input types from parsed read types and persist
validated JSON wire values rather than transformed outputs. Use the same wire
validation in test stores and migrate context wrappers to retain both types.

Typecheck subscription response implementations and preserve their concrete
response schemas so the definition can be reused as a typed request contract.
Cover these guarantees through public source/built/packed consumer tests and
SQLite restart tests. Broader error-taxonomy and release nomination work remain
separate.
