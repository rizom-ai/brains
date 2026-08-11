---
"@brains/entity-service": patch
"@brains/directory-sync": patch
"@brains/email": patch
"@brains/notifications": patch
"@brains/email-triage": patch
---

Harden provider boundaries and the entity round-trip against failures visible
with live transports. Entity adapters strip the system-injected `visibility`
frontmatter key before domain validation, so strict adapters accept their own
exported files on re-import, and both directory-sync deletion paths treat a
quarantined (`.invalid`) file as ours, not a user deletion — together these
stop restricted entities from being quarantined and then destroyed moments
after creation. Optional email transport settings and the notifications
default recipient treat empty env interpolations as absent so inbound-only
postures boot as documented. The email-triage classifier sends a flat wire
schema (OpenAI strict structured outputs reject root-level unions) and maps it
onto the unchanged domain decision union.
