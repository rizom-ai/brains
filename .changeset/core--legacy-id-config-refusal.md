---
"@rizom/brain": patch
---

A brain.yaml config that a first-party package converted to a declarative definition refuses is reported under the plugin id its class had (`Invalid plugin config for email at imap.port`), as before the conversion, instead of under its package-scoped name.
