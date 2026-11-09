---
"@rizom/brain": patch
---

A brain.yaml config that a first-party package converted to a declarative definition refuses is reported under the plugin id its class had, the key the brain.yaml names (`Invalid plugin config for email at imap.port`), as before the conversion, instead of under its package-scoped name. This also corrects the wording for the packages converted earlier in this release line (the schema-only entities, small services, publishing entities and auth-dependent services), which reported their package-scoped name.
