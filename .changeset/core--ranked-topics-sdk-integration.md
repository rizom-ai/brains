---
"@brains/topics": patch
"@brains/plugins": patch
"@brains/entity-service": patch
"@rizom/brain": patch
---

Integrate ranked Topics through installed declarations, scoped checkpoints and owner-checked background jobs. Add detached source-policy reads, declared independent causal roots with bounded durable delays, and exact rule/version retirement on the installed entity's owned type. Preserve public publication floors and validate body, metadata and visibility revisions after generation.

Add owner-scoped conditional removal using host-issued opaque editing snapshots. Topic trimming and replacement conflict on concurrent changes instead of deleting a newly restricted or edited record. Lease release uses one CAS, avoiding deletion of a replacement worker's claim. Ranked evaluations use local topic/checkpoint state rather than a second native extraction pipeline.

Stop old writers before the one-way projection handoff; no mixed-version/downgrade guarantee or silent native-checkpoint reset is provided. Delete/create replacement remains non-atomic. The ten logical generation calls per job are not a provider-attempt, spending, total-duration, scan or memory bound. Live provider, publishing and rollout acceptance remain separate.
