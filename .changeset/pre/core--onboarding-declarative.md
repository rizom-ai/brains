---
"@rizom/brain": patch
---

Onboarding is a declarative service. Enabled, it plants its bundled playbooks once startup content settles, through the playbook type's steward, so a playbook with the same id is never overwritten, and registers its first web-chat starter once the brain is ready, as before, under the same `onboarding` plugin, after the playbook plugins it depends on.
