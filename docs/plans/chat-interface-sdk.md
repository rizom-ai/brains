# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active plan for the `@brains/chat` Discord implementation.

Scope is intentionally narrow: bring Discord via Chat SDK to parity with the important `interfaces/web-chat` operator workflows. Do not add multi-provider planning here.

## Working rule

Prefer **shared pure helpers in `shell/plugins/src/message-interface/`** plus interface-specific rendering/transport code.

Shared candidates should be escalated when they are independent of Discord threads, browser sessions, routes, or UI components. Keep Discord-specific posting, editing, routing, gateway, and permission-context behavior in `interfaces/chat`.

## Remaining parity work

### 1. Shared parity helpers

Move duplicate workflow rules out of `interfaces/web-chat` and `interfaces/chat` when they can be expressed as transport-neutral helpers.

No obvious shared pure-helper candidates remain. Revisit this section only if future Discord/web-chat parity work reveals duplicated transport-neutral rules.

Acceptance criteria:

- Shared helpers have focused unit tests in `shell/plugins/test/message-interface/`.
- Web chat and Discord call the same helper for the same workflow rule.
- Shared helpers return data/decisions, not browser markup or Discord message text.

### 2. Upload route security and live validation

Discord uploads currently use runtime upload storage and a download route. The remaining work is validating the documented production access model.

Required work:

- Validate the Discord stored-upload route in local and hosted deployments.
- Keep generated/protected artifact delivery separate from source-upload refs; use signed or authenticated routes before exposing non-public generated PDFs/images outside operator-only contexts.

Acceptance criteria:

- Trusted/anchor users can upload and reuse text, image, and PDF files in live Discord flows.
- Public users cannot trigger protected upload download/reuse paths.

### 3. Restart and session validation

Discord uses channel/DM/thread identity as its session model. The remaining work is live validation and any missing persisted mapping/state discovered during validation.

Required work:

- Validate restart continuation for channel, DM, and subscribed-thread conversations.
- Validate restored upload context after restart.
- Validate restored pending approvals after restart.
- Decide whether any additional Discord conversation mapping must be persisted beyond thread/channel-derived conversation IDs.

Acceptance criteria:

- A Discord conversation can continue after process restart without losing upload context or confusing approvals.
- Discord thread/channel identity remains the session UX; no browser-style session sidebar is required.

### 4. Generated artifacts

Discord needs a reliable native path for generated image/PDF artifacts.

Required work:

- Validate Discord-native artifact summaries with links in live flows.
- Decide whether generated images/PDFs should be attached directly, proxied through authenticated/signed routes, or linked only.
- Ensure artifact retrieval is permission-gated for non-public artifacts.
- Validate queued/completed/failed artifact job status in Discord.

Acceptance criteria:

- Discord users can retrieve common generated image/PDF artifacts without switching to web chat.
- Non-operator/public users cannot fetch protected artifacts.
- Artifact status is understandable when generation is queued, completed, or failed.

### 5. Live Discord trial

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
- Shared parity rules live in message-interface helpers instead of being duplicated.
- Durable upload and conversation state survives restart for supported flows.
- Protected upload/artifact/confirmation flows are permission-gated.
- Live Discord validation passes.
