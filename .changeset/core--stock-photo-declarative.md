---
"@brains/stock-photo": minor
---

Migrate `@brains/stock-photo` to the declarative surface. The plugin class, the job handler class and the cover writer are deleted; the package is one `defineServicePlugin` with two tools and one job, importing `@brains/sdk/services`, `@brains/image` and `@brains/utils`.

**Selecting a photo no longer writes an `image` entity or a target's `coverImageId` itself.** The select job tracks the download, fetches the picture, and hands it to the image type's own create route through `createRouted` — the same route `system_create` takes. The image package names the picture, stores it once per source URL, and links it into the target's cover; a target that is gone, or a type that declares no cover, is refused there and fails the job instead of leaving an orphan with a warning.

**The select tool's answer changes shape.** It returns `{ attribution, jobId, status: "generating" }` and no longer guesses the entity id or reports `alreadyExisted` up front; the job's result carries `imageEntityId`, `alreadyExisted` and, when a target was named, `coverSet`. The `alt` input is gone — the image route derives alt text from the title.

`coverTakingType` moves from the image package's test helpers to `@brains/plugins/test`, for any test that seeds a target an image can be the cover of.
