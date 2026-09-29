---
"@rizom/brain": patch
---

Integrate Contact's separate-worker recovery through existing declarative checks and owned shared freshness state. Preserve abort/draining, strict origin and preview gates, restricted persistence and worker HTTP exclusion. Advertise bounded, schema-validated form metadata through an all-role subscription for site builds, without exposing handlers or implying live readiness. Replace the process-local maintenance timer with one daily recurring-check definition; remove its obsolete test-injection factory.
