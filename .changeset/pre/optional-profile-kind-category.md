---
"@brains/a2a": patch
"@brains/agent-discovery": patch
"@brains/app": patch
"@brains/assessment": patch
"@brains/atproto": patch
"@brains/atproto-contracts": patch
"@brains/core": patch
"@brains/entity-service": patch
"@brains/identity-service": patch
"@brains/plugins": patch
"@brains/profile": patch
"@brains/site-info": patch
"@brains/site-personal": patch
"@brains/site-professional": patch
"@brains/test-utils": patch
"@rizom/brain": patch
"@rizom/ops": patch
---

Move optional semantic profile kind selection into `brain.yaml`, derive a closed structural category through an app-scoped finalized registry, validate profile persistence with the selected kind schema, and publish the new `{ kind, category }` A2A and ATProto card contract.
