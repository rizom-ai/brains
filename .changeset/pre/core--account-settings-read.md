---
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A service reads its own account settings for the current caller with `accountSettings.read()`, in its tools and routes and in every operator callback, loaders and `prepare` included: the caller's own settings, or `null` for a caller without an account or one who has none. Each field the definition marks `secret` comes back as an `AccountSettingsSecret`, whose `reveal()` returns the value and whose `toJSON()`, `toString()`, interpolation and inspection give `[secret]`, so a secret placed by accident in view data, a route answer, a tool result or a log line leaves as the marker. Writes stay with `execute`, tools and routes, and an operator callback's `settings` stays redacted.
