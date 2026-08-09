---
"@brains/plugins": patch
"@brains/entity-service": patch
"@brains/directory-sync": patch
"@brains/email": patch
"@brains/notifications": patch
"@brains/email-triage": patch
"@rizom/brain": patch
---

Harden startup and the entity round-trip against failures only visible in the
built binary or with live providers. The HTTP route snapshot binding rides the
shell object under a global-registry symbol so separately bundled runtime
entrypoints resolve it (the webserver daemon failed to start in every canonical
boot since the immutable route registry landed). Entity adapters strip the
system-injected `visibility` frontmatter key before domain validation, so
strict adapters accept their own exported files on re-import, and both
directory-sync deletion paths treat a quarantined (`.invalid`) file as ours,
not a user deletion — together these stop restricted entities from being
quarantined and then destroyed moments after creation. Optional email
transport settings and the notifications default recipient treat empty env
interpolations as absent so inbound-only postures boot as documented. The
email-triage classifier sends a flat wire schema (OpenAI strict structured
outputs reject root-level unions) and maps it onto the unchanged domain
decision union. A boot smoke test builds and boots the canonical binary with
an add:-ed plugin so both bundle-boundary regression classes fail CI instead
of shipping.
