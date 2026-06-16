# Pending Entity Ingestion Plan

The shared ingestion helper (`shell/plugins/src/entity/pending-ingestion.ts`) and the `entities/link` adopter are in place. This plan now covers only extending that lifecycle to media/upload entities.

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

## Remaining work

1. Extend the lifecycle to media/upload entities via the shared helper:
   - create image/upload placeholders as soon as uploads are accepted
   - run OCR/caption/thumbnail/embedding as async jobs
   - update the same entity to `draft` or `failed`

2. Add evals/tests for the media path:
   - upload/save an image then immediately refer to it
   - processing failure leaves a visible pending/failed entity

## Notes

Search quality for exact URLs and upload references is a separate retrieval concern. Pending ingestion guarantees the entity exists immediately; exact lookup/search should still be improved where needed.
