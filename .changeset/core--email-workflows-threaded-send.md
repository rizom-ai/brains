---
"@brains/plugins": minor
"@brains/email": minor
"@brains/email-workflows": minor
"@brains/cms": minor
"@rizom/brain": patch
---

Add bounded email threading metadata and ship explicit confirmation-gated sending for saved reply-draft revisions. Recipients, subjects, and reply headers are resolved from fresh mailbox source reads; stable per-revision idempotency and persisted provider acceptance keep retries safe without storing original messages.
