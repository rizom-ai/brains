---
"@brains/core": patch
"@brains/entity-service": patch
"@brains/conversation-service": patch
"@brains/site-builder-plugin": patch
---

Construct each shell from fresh service and initializer instances without resetting process-global singletons, honor entity service/registry overrides, and keep site-builder profile access bound to its owning shell.
