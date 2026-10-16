---
"@brains/atproto": patch
"@rizom/ops": patch
---

Member handles under the fleet domain: the atproto plugin serves the owner's account DID at /.well-known/atproto-did when accountDid is configured, so a member's Bluesky handle (@<handle>.<domainSuffix>) verifies against their own brain via the HTTP method — no DNS records. Pilot plumbing: users/<handle>.yaml atproto.accountDid flows into the generated brain.yaml plugin config; operator playbook updated.
