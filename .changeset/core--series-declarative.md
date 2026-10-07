---
"@brains/series": minor
"@brains/sdk": minor
---

Migrate `@brains/series` to the declarative surface. It now imports only `@brains/sdk/entities`, making it the fifth publishable-clean entity package, and exercises every capability added for derived entities: a projection rule sourcing across all types, an AT Protocol projection, declarative content generation, templates, and a general data source.

Promotes the symbols it needs: the structured body formatter, the AT Protocol projection contracts and canonical lexicons, `generateMarkdownWithFrontmatter`, `computeContentHash`, and `ProjectionWriteIntent`. `coverImageId` moves into series metadata, since a declarative codec encodes from metadata alone. Its unused `SeriesManager` service is deleted.
