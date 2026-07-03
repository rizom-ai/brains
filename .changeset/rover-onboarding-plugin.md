---
"@brains/playbooks": minor
"@brains/rover-onboarding": minor
"@brains/rover": minor
"@rizom/ops": patch
"@brains/test-utils": patch
---

Add a Rover onboarding service plugin that owns bundled onboarding playbooks and registers the first web-chat starter through the playbooks runtime. Playbooks now accepts runtime lifecycle starter registrations, and Rover/ops opt into onboarding through the new plugin config instead of the generic trigger flag.
