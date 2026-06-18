# Pending Entity Ingestion Plan

## Status

Current in-repo scope is implemented.

Shipped coverage:

- Shared pending-ingestion helpers in `shell/plugins` preserve entity IDs across `pending` → `draft` / `failed` transitions.
- `entities/link` creates durable pending placeholders before queued capture and updates the same entity on completion/failure.
- `entities/image` creates durable pending placeholders before queued upload promotion, AI generation, and source-image rendering, then updates the same image entity to `draft` or `failed`.
- `entities/document` creates durable pending placeholders before queued source-derived PDF generation, then updates the same document entity to `draft` or `failed`.
- Raw PDF upload promotion is synchronous and now records `draft` ingestion/source metadata.
- Unit coverage exists for immediate placeholders, same-ID completion, and failure-to-`failed` behavior on image and document paths.

No current in-repo async entity ingestion path is known to still accept work while leaving the accepted entity invisible. Future audio/video-specific entity packages or new OCR/caption/thumbnail processors should adopt the same lifecycle when they are introduced.

## Problem

Some entity creation flows persist durable content asynchronously. A create tool may return `status: generating` while a background job fetches, extracts, captions, OCRs, or otherwise enriches the entity later.

That creates a conversation consistency bug: the user can immediately refer to the just-saved item, but search/read may not find it yet. This showed up with links: after saving two URLs, a follow-up summary request could only find the first completed link and miss the second queued one.

The same pattern applies to images, uploads, PDFs, audio, and video.

## Principle

Creation must make a durable placeholder immediately. Async processing enriches the same entity later.

Do not create a separate final entity after processing. Do not leave a successfully accepted create request invisible until the background job completes.

## Shared contract

Use a common ingestion lifecycle in entity metadata/frontmatter where the entity type supports it:

- `pending`: accepted and durable, enrichment is in progress or content is incomplete
- `draft`: enrichment completed and the entity is ready for review/use
- `failed`: durable placeholder remains, but enrichment failed and can be retried

Recommended optional fields:

- `processingJobId`
- `processingError`
- source reference, e.g. channel/upload/URL
- media or source metadata needed for follow-up lookup

## Future follow-up trigger

Open a new implementation slice when a new entity/upload path accepts asynchronous media work before durable persistence, especially:

- audio/video entity packages
- separate OCR/caption/thumbnail enrichment jobs
- new upload promotion flows outside image/document/link

## Notes

Search quality for exact URLs and upload references is a separate retrieval concern. Pending ingestion guarantees the entity exists immediately; exact lookup/search should still be improved where needed.
