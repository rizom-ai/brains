---
"@brains/deploy-support": patch
"@brains/rover": patch
"@rizom/brain": patch
"@rizom/ops": patch
---

Add ATProto brain-card discovery event contracts, revise `ai.rizom.brain.card` to the nested brain identity plus minimal anchor snapshot shape, serve conventional/configured brain and anchor `did:web` documents, default omitted brain/anchor DIDs from the site host, include ATProto in Rover core with optional PDS identifier config plus env-based app password, add the deploy/env bridge for ATProto pilot secrets, add a bounded `atproto_discover_brain_cards` candidate-read tool, and handle discovered cards by creating reviewable agents or enriching existing approved agents with signed card metadata.
