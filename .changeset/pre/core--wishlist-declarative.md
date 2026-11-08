---
"@rizom/brain": patch
---

The wishlist is a declarative entity package. Wishes are stored, deduplicated and shown as before: the same `wishlist` plugin and `wish` type, the same frontmatter, the same create route for every shape a wish arrives in (a wish asked for again within `sameWishDistance` and confirmed by the same-wish check raises its count), the same `sameWish` eval, the same top-wishes Dashboard widget and agent instructions. `sameWishDistance` is still set through the wishlist's config. A wish's `declinedReason` is now part of its metadata, so Studio and readers see it there too.

The `wish:create` job type is retired: nothing has enqueued it since wishes moved to the create route. A `wish:create` job still queued when the brain starts is settled as failed with the public `no_handler` error rather than left waiting.
