---
"@brains/image-plugin": minor
"@brains/document-plugin": minor
"@brains/conversation-memory": minor
"@brains/sdk": minor
---

Publishable-clean reaches 18 of 18 **entity packages**. `@brains/agent-discovery` was counted before it was true: it had come off plugin classes but still declared `@brains/plugins` as a runtime dependency and reached for it in eleven source files, so it is converted here. Each one's `src` now imports only `@brains/sdk` plus shared publishable libraries, so none of them expose internal `@brains/*` workspace packages as part of the public authoring contract. The 29 packages under `plugins/` and `interfaces/` are a separate tranche and none are clean yet — 28 of them still import `@brains/plugins` directly. `@brains/document-plugin`, `@brains/image-plugin` and `@brains/conversation-memory` were the last three, and each shed its plugin classes and adapters for declarations.

**Deployment note for `@brains/image-plugin`: drain the job queue first.** The job types changed — `image-generate`, `image-render-source` and `upload-promote` are now `@brains/image-plugin:image:generate` and `:render`, and the upload path is no longer a job at all. Jobs already queued under the old names will not find a handler. The retired `image-generate` alias was carried in `docs/legacy-code-inventory.json` against exactly this prerequisite ("observe zero queued or invoked jobs using the retired handler name"), which has not been observed. Drain before deploying, or accept that in-flight image jobs are lost.

The conversions cost capabilities the blocker audit did not predict, each added with a named consumer: a generation result that links itself into an entity the package may not touch; an attachment on an allocation, so a caller gets a link to an artifact that does not exist yet; a codec that decodes partial metadata, because a document's filename lives in a sidecar; the runtime's own allocation fields surviving a declared input schema, which had been silently dropping the hash that makes a concurrent edit win; `find` on job entity access, so "put a cover on the launch post" can name the post the way a person would; and `frontmatterInContent` for types whose files keep their own frontmatter.

That last one closed a defect in both packages that keep frontmatter inside `content`: encoding passed the content through unchanged, so a status change reaching metadata never reached the file it is stored in.

`@brains/conversation-memory` reads memory but does not currently derive it; its producer is restarted separately.
