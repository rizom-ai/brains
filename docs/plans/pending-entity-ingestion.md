# Pending Entity Ingestion Plan

## Status

Partial. The shared helper and link adopter are shipped. The media slice now covers current image and PDF/document async paths:

- Image create flows create durable `pending` placeholders before queueing upload promotion, AI generation, or source-render jobs, then update the same entity to `draft` or `failed`.
- Source-derived PDF/document generation creates a durable `pending` document before queueing and updates that same entity to `draft` or `failed`.
- Raw PDF upload promotion is already synchronous and now writes `draft` ingestion metadata.

Remaining work is limited to future media/upload processors that are not represented by current entity packages yet (for example audio/video-specific entities or OCR/caption pipelines beyond the existing image/document paths) plus broader eval coverage.

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

1. Extend the lifecycle to any future media/upload entity packages and processors:
   - audio/video-specific entities when added
   - OCR/caption/thumbnail processors if they become separate async enrichment jobs
   - any upload flows that currently accept work before durable entity creation

2. Add broader evals for the media path:
   - upload/save an image then immediately refer to it
   - processing failure leaves a visible pending/failed entity
   - source-derived PDF/image artifact save then immediate follow-up by returned entity ID

## Notes

Search quality for exact URLs and upload references is a separate retrieval concern. Pending ingestion guarantees the entity exists immediately; exact lookup/search should still be improved where needed.
