---
"@rizom/brain": patch
"@brains/sdk": patch
"@brains/plugins": patch
"@brains/ask-content": patch
"@brains/web-chat": patch
"@brains/dashboard": patch
"@brains/directory-sync": patch
---

Integrate current main without restoring retired plugin classes. Preserve authored Ask copy through a declarative singleton and a separate markdown frontmatter schema, retain opt-in dashboard Ask assets and guest admission, reuse the extracted remote-agent handlers through bounded SDK capabilities, and adapt directory-sync recovery to its options contract.
