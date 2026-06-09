# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active plan for the `@brains/chat` Discord implementation.

Scope is intentionally narrow: bring Discord via Chat SDK to parity with the important `interfaces/web-chat` operator workflows. Do not add multi-provider planning here.

## Working rule

Prefer **shared pure helpers in `shell/plugins/src/message-interface/`** plus interface-specific rendering/transport code.

Shared candidates should be escalated when they are independent of Discord threads, browser sessions, routes, or UI components. Keep Discord-specific posting, editing, routing, gateway, and permission-context behavior in `interfaces/chat`.

## Remaining parity work

### 1. Upload route security and live validation

Discord uploads currently use runtime upload storage and a download route. The remaining work is validating the documented production access model.

Required work:

- Validate the Discord stored-upload route in local and hosted deployments.
- Keep generated/protected artifact delivery separate from source-upload refs; use signed or authenticated routes before exposing non-public generated PDFs/images outside operator-only contexts.

Acceptance criteria:

- Trusted/anchor users can upload and reuse text, image, and PDF files in live Discord flows.
- Public users cannot trigger protected upload download/reuse paths.

### 2. Restart and session validation

Discord uses channel/DM/thread identity as its session model. The remaining work is live validation and any missing persisted mapping/state discovered during validation.

Required work:

- Validate restart continuation for channel, DM, and subscribed-thread conversations in live Discord.
- Validate restored upload context after restart.
- Validate restored pending approvals after restart.
- Determine whether Chat SDK adapter state loss affects subscribed-thread follow-ups after restart.

Decision record:

- Durable conversation parity belongs in the existing conversation service: deterministic Discord conversation IDs, stored messages, upload refs, approval cards, and artifact cards.
- Chat SDK adapter state is separate operational state: subscriptions, locks, queues, lists, and arbitrary SDK cache.
- Do **not** store Chat SDK adapter state in conversation/message metadata.
- Do **not** add a local file-state adapter here; it creates a local-only backend that is not the desired production shape.
- If live validation proves adapter state persistence is required, implement a dedicated DB-backed Chat SDK `StateAdapter` in/near the conversation service using proper tables/transactions, not Redis and not metadata blobs.

Acceptance criteria:

- A Discord conversation can continue after process restart without losing upload context or confusing approvals.
- Discord thread/channel identity remains the session UX; no browser-style session sidebar is required.

### 3. Generated artifacts

Discord needs a reliable path for generated image/PDF artifacts.

Current behavior:

- Discord renders attachment cards as readable text summaries.
- Summaries include title, description, filename, media type, size, preview/open/download links when present.
- Relative artifact links are resolved against the configured site URL, or local site URL when `preferLocalUrls` is enabled.
- This is still link delivery, not native Discord file upload.

Required work:

- Validate Discord artifact summaries with links in live flows.
- Decide whether generated images/PDFs should be attached directly, proxied through authenticated/signed routes, or linked only.
- Ensure artifact retrieval is permission-gated for non-public artifacts.
- Validate queued/completed/failed artifact job status in Discord.

Acceptance criteria:

- Discord users can retrieve common generated image/PDF artifacts without switching to web chat.
- Non-operator/public users cannot fetch protected artifacts.
- Artifact status is understandable when generation is queued, completed, or failed.

### 4. Live Discord trial

Run an end-to-end Rover trial with `@brains/chat` replacing `@brains/discord`.

Required smoke checks:

- Mention routing.
- DM routing.
- Thread subscription.
- Text/image/PDF uploads.
- Upload follow-up by filename and recency.
- Confirmation approve/cancel.
- Long-running generation progress.
- Generated image/PDF artifact retrieval.
- Webhook route handling.
- Restart continuation.

Acceptance criteria:

- Live validation passes, or each blocker is documented with a rollback path.
- Rover can safely choose `@brains/chat` as its Discord implementation, or defer for a specific documented reason.

## Non-goals

- Adding other chat providers.
- Replacing the browser web chat UI.
- Building a shared hosted Discord bot gateway.
- Recreating browser-only UI affordances such as session sidebars inside Discord.

## Validation commands

Use the smallest relevant set for each slice:

- `cd shell/plugins && bun test test/message-interface/<helper>.test.ts`
- `cd shell/plugins && bun run typecheck && bun run lint`
- `cd interfaces/chat && bun run typecheck && bun test && bun run lint`
- `cd interfaces/web-chat && bun run typecheck && bun test <focused-test> && bun run lint`

Run broader checks only when shared contracts or package exports change.

## Completion criteria

This plan is complete when:

- Discord via `@brains/chat` covers the web-chat workflow classes above with Discord-native UX where needed.
- Durable upload and conversation state survives restart for supported flows.
- Protected upload/artifact/confirmation flows are permission-gated.
- Live Discord validation passes.
