# Plan: LinkedIn Native Document Publishing

## Status

Implemented. A diagnostic call confirmed that the previous LinkedIn PDF/carousel publisher used an obsolete or unsupported document upload path.

Observed results with the current token:

- `POST /v2/assets?action=registerUpload` using `feedshare-document` returned `403 ACCESS_DENIED` with a request-body validation error for `registerUploadRequest.recipes/relationshipType`.
- `POST /rest/documents?action=initializeUpload` returned `200 OK` with a valid document URN and upload URL.

## Goal

Publish LinkedIn PDF carousel posts through LinkedIn's current native document flow.

## Non-goals

- Do not change text-only or image LinkedIn publishing unless required.
- Do not change deck carousel PDF generation.
- Do not expose or log LinkedIn tokens or upload URLs beyond diagnostic/debug-safe summaries.

## Implementation

Update `entities/social-media/src/lib/linkedin-client.ts`:

1. Keep existing author resolution.
2. Replace document upload registration for PDFs with:
   - `POST https://api.linkedin.com/rest/documents?action=initializeUpload`
   - headers: `Linkedin-Version: YYYYMM`, `X-Restli-Protocol-Version: 2.0.0`
   - body: `{ initializeUploadRequest: { owner: author } }`
3. Upload the PDF bytes to the returned `uploadUrl`.
4. For document posts, publish via:
   - `POST https://api.linkedin.com/rest/posts`
   - body includes `author`, `commentary`, `visibility`, `distribution`, `content.media.id`, `content.media.title`, `lifecycleState: PUBLISHED`
5. Preserve current `/v2/ugcPosts` behavior for text/image posts, unless a shared `/rest/posts` path is simpler and tested.

## Tests

Add/adjust unit tests in `entities/social-media/test/lib/linkedin-client.test.ts`:

- document upload initializes through `/rest/documents?action=initializeUpload`
- PDF upload uses returned `uploadUrl`
- document publish uses `/rest/posts` with `content.media.id`
- failed document initialization throws and does not publish text-only fallback
- image/text publishing still works

## Validation

- `bun run typecheck`
- targeted social-media tests
- local publish retry of `social-post/good-people-are-not-enough-carousel`

## Estimate

Not a few-line fix, but still small and isolated: mostly one client file plus tests.
