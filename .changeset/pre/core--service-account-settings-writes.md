---
"@brains/plugins": patch
"@brains/utils": patch
"@brains/linkedin-import": patch
"@rizom/brain": patch
---

A service writes its own account settings for an account the runtime vouches for. The `tools` and `routes` slots of a service that declares `accountSettings` are given `accountSettings`: `save(values)` writes the current caller's own account, `claim()` returns a single-use state naming the caller's account and, through a browser session, that session's account, and `redeem(state, produce)` consumes a claim before `produce` runs and writes what it returns, from a session of the same account when the claim was made in one. A refused value is named by its field alone. The consent-state lifetime main's LinkedIn import uses, ten minutes and twenty waiting, is now `CONSENT_STATE_LIFETIME` in `@brains/utils/single-use-store`, which the import and the runtime share.
