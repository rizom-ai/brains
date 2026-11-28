---
"@brains/entity-service": minor
"@brains/plugins": minor
"@brains/blog": minor
"@brains/content-pipeline": minor
"@brains/site-builder-plugin": minor
"@brains/studio": minor
"@rizom/brain": minor
---

Publishing is one board, a post starts as a draft, and Site leads with the site itself.

- Studio starts a new entry of a publishable type as a draft, and leaves the fields its type needs to publish empty instead of required, so creating a post asks only for its title and body. Stored posts are read as before.
- An entity type's `publish` declaration can name `requiredFields`. Posts name excerpt and author. content-pipeline refuses to queue or publish an entry until those are filled, saying what to add ("Add excerpt and author before publishing.").
- In Studio the status field is read-only for types a publishing workspace handles: the publish control moves it. That control names what a draft still needs, and keeps Queue and Publish unavailable until it is filled.
- Publishing is a board: Drafts, Queued, Published and Failed. A card moves on by its button or by dragging it to the next column: a draft is queued, a queued entry goes back to drafts, and a failure is retried. Each card shows its type and destination, a draft shows what it still needs, and a publication shows when it went out. The pipeline snapshot lists recent drafts and publications instead of only counting them.
- Site leads with one sentence on how the preview stands against the live site, the links to open either, and Build preview and Publish site. Build details, routes and automation follow under Technical.
