---
"@brains/site-info": minor
"@brains/sdk": minor
---

Migrate `@brains/site-info` to the declarative surface. The EntityPlugin
class, its adapter, its service and its DataSource class are deleted: the
singleton becomes a `defineEntity` declaration seeded on content-sync, its
metadata read becomes a `defineDataSource`, and both bus behaviours become
declared subscriptions.

**The service plugin is now `site-metadata`.** A service and an entity type
of the same name both scope to `${packageName}:site-info` and collide at
boot; `defineServicePlugin` now refuses that where it is written instead.
The capability id in a brain definition is unchanged.

Subscription handlers receive `entities` (reads), `identity` and
`messaging`. Most requests are answered from the brain's own records rather
than the payload — a site with no title of its own is titled after its
anchor — and a handler that reacts to a change has to say what the change
now means. Named consumers: `@brains/site-info`, `@brains/newsletter`.

The dead `siteInfo` config option is dropped; nothing passed it.
