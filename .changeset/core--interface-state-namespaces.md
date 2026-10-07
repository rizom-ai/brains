---
"@brains/plugins": minor
"@brains/runtime-state": patch
"@brains/sdk": minor
"@rizom/brain": minor
---

Isolate every interface-owned runtime-state namespace by package and declaration identity. The tagged encoding prevents same-ID interfaces in different packages from sharing undotted state and keeps email's dotted namespaces separate from package `@email/inbound`.

Preserve existing workspace package-owned keys, but stop reading declaration-only interface keys. The email integration has no production use, and the operator confirmed Discord/Slack thread-following state is not relied on. Apply the alpha correction directly, without migration or legacy fallback. Existing bot thread-following and mention-routing settings start fresh; chat history is unchanged. Old interface rows remain untouched. Upload ownership is addressed separately; this state-key change does not move files.

Allow up to 512 characters in physical runtime-state namespaces so the qualified owner encoding accommodates ordinary longer package names without changing the allowed characters or existing keys.

Add public SDK regressions for both interface families, including same-ID owners after finalization, and SQLite restart coverage for cross-family isolation, qualified owner lengths, distinct package/declaration identities, and no adoption or deletion of old interface rows.
