---
"@brains/profile": minor
"@brains/sdk": minor
---

Migrate `@brains/profile` to the declarative surface. The plugin class is
deleted: the built-in profile kinds become a `profileKinds` declaration, the
anchor-profile frontmatter and persist validator become `entityExtensions`,
and the starter-identity flow becomes a declared job that `ready` and an
initial-sync subscription enqueue once both signals have arrived.

**Starter identity retries through the job queue.** A provider outage used
to leave the flow waiting for another initial-sync signal that might never
arrive; the failure now reaches the queue, which retries it.

Four capabilities are added to the service surface, each measured against
existing consumers:

- `stewards` — a package may claim lifecycle stewardship of a system entity
  type it did not register, which joins the type to its owned set for scoped
  writes. At most one steward per type, and the type must already exist.
  Named consumer: `@brains/profile` over `anchor-profile`.
- `profileKinds` — profile kinds declared as data, registered before the
  app-scoped selection is finalized.
- `entityExtensions` — frontmatter and persistence validators applied after
  registration completes, restricted to the package's owned set and given
  the finalized profile-kind selection.
- `jobs` in `ready` and `subscriptions` — so boot-time work can be enqueued
  rather than performed inline.

Job handlers also receive `domain` and a read-only `profileKinds`, and
scoped entity access gains `getEntityCounts`. `SYSTEM_CHANNELS`, the profile
kind types, the identity body schemas and `ServiceEntityExtension` are
published on `@rizom/brain/services`.

`fetchAnchorProfileData` now takes a structural `AnchorProfileReader` — one
`listEntities` call — instead of the whole entity service. Existing callers
that pass an entity service are unaffected.
