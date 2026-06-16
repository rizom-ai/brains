# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active plan for the `@brains/chat` Discord implementation.

Scope is intentionally narrow: bring Discord via Chat SDK to parity with the important `interfaces/web-chat` operator workflows. Do not add multi-provider planning here.

Implementation status:

- **Implemented and covered by automated tests:** Discord routing/permission checks, upload ingestion/reuse, stored upload route hardening, approval rendering/selection/retry/restart restore, confirmation result summaries, artifact link summaries, shared artifact entity/data-url helpers, scoped artifact retrieval by caller visibility, native Discord image/PDF artifact file posting for trusted/anchor chat and confirmation responses, artifact-card job progress tracking, live tool activity, async progress edits/fallbacks, response chunking, webhook route delegation, and Rover opt-in wiring.
- **Pending live validation:** Discord mention/DM/thread behavior, real upload delivery, progress edits, webhook delivery, generated artifact link retrieval, and restart continuation.
- **Needs an explicit implementation decision:** DB-backed Chat SDK `StateAdapter` for adapter operational state. It is not required for stored messages/uploads/approvals, but it may be required for subscribed-thread state, queues, locks, or SDK caches across restart.
- **Needs an explicit product/security decision:** Signed/authenticated routes for generated/protected artifacts outside trusted/anchor native Discord delivery. Current fallback behavior is link summaries.

## Working rule

Prefer **shared pure helpers in `shell/plugins/src/message-interface/`** plus interface-specific rendering/transport code.

Shared candidates should be escalated when they are independent of Discord threads, browser sessions, routes, or UI components. Keep Discord-specific posting, editing, routing, gateway, and permission-context behavior in `interfaces/chat`.

## Next action order

1. Decide whether to build DB-backed Chat SDK adapter state before live validation or keep it gated on a subscribed-thread restart failure.
2. Decide the remaining generated/protected artifact delivery policy for public/external access: fallback links only or signed/authenticated artifact routes.
3. Run the live Rover Discord trial using the checklist below.
4. If the live trial passes, update Rover migration guidance and decide when `@brains/chat` can replace `@brains/discord` for Discord.

## Remaining parity work

### 1. Upload route security and live validation

Discord uploads currently use runtime upload storage and a download route. The remaining work is validating the documented production access model.

Current behavior:

- Discord and web-chat binary/download routes share `formatContentDispositionHeader()` for ASCII-safe fallback filenames plus UTF-8 `filename*` preservation.
- Discord upload responses are no-store/nosniff and only serve Discord-scoped source upload refs when the Discord adapter is configured.

Required work:

- Validate the Discord stored-upload route in local and hosted deployments.
- Keep generated/protected artifact delivery separate from source-upload refs; use signed or authenticated routes before exposing non-public generated PDFs/images outside operator-only contexts.

Acceptance criteria:

- Trusted/anchor users can upload and reuse text, image, and PDF files in live Discord flows.
- Public users cannot trigger protected upload download/reuse paths.

### 2. Restart and session validation

Discord uses channel/DM/thread identity as its session model. The remaining work is live validation and any missing persisted mapping/state discovered during validation.

Current behavior:

- Discord subscribes to threads only after channel/DM/bot/self routing checks pass; subscription failures are logged but do not block the current reply.
- Self-authored messages are ignored for direct routing and passive URL capture to avoid feedback loops.
- Pending approvals are restored from stored approval cards, keep remaining approvals pending after partial approve/cancel, support chained approvals returned by confirmed actions, and stay retryable after confirmation errors.
- Approval id matching is token-based and exact, including real `approval:call-*` ids with shared prefixes.

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
- Trusted/anchor users receive native Discord file uploads for generated image/PDF artifact cards when the card resolves to a stored `image` or `document` entity visible to their permission level.
- Web attachment routes and Discord native artifact posting fetch artifacts with `permissionToVisibilityScope(level)` so restricted artifacts are not delivered to trusted-only callers.
- Public users do not receive native protected artifact files; link summaries remain the fallback.

Required work:

- Validate Discord artifact summaries and native image/PDF file uploads in live flows.
- Decide whether fallback links for non-native or public artifact access need authenticated/signed routes.
- Validate queued/completed/failed artifact job status in Discord. Automated coverage now tracks progress for both `toolResults[].jobId` and attachment-card `jobId` responses.

Acceptance criteria:

- Discord users can retrieve common generated image/PDF artifacts without switching to web chat.
- Non-operator/public users cannot fetch protected artifacts.
- Artifact status is understandable when generation is queued, completed, or failed.

### 4. Live Discord trial

Run an end-to-end Rover trial with `@brains/chat` replacing `@brains/discord`.

Trial setup:

- Start Rover with an instance config that removes `discord` and adds `chat`.
- Keep eval mode disabling both `discord` and `chat`.
- Use a Discord permission rule such as `discord:* -> trusted` for upload/reuse checks, then repeat selected public-user checks without that rule.
- Use a channel allowlist for at least one pass so mention, URL capture, and subscription gating are all exercised.

Required smoke checks:

- Mention routing.
- DM routing.
- Thread subscription and behavior when subscription is unavailable.
- Text/image/PDF uploads.
- Upload follow-up by filename and recency.
- Public-user upload rejection/reuse denial.
- Confirmation approve/cancel, multiple approvals, chained approvals, bad approval ids, and retry after an error.
- Long-running generation progress, completion, failure, and standalone terminal updates.
- Generated image/PDF artifact retrieval by link.
- Webhook route handling.
- Restart continuation for channel, DM, and subscribed-thread conversations.

Acceptance criteria:

- Live validation passes, or each blocker is documented with a rollback path.
- Rover can safely choose `@brains/chat` as its Discord implementation, or defer for a specific documented reason.

Validation record template:

```md
Date:
Rover instance/config:
Discord environment: channel / thread / DM / webhook
Operator permission rule used: yes/no
Result: pass / blocked / deferred

Checks:

- [ ] Mention routing
- [ ] DM routing
- [ ] Thread subscription
- [ ] Text/image/PDF uploads
- [ ] Upload follow-up by filename and recency
- [ ] Public-user upload rejection/reuse denial
- [ ] Confirmation approve/cancel
- [ ] Multiple/chained/bad-id/retry approval flows
- [ ] Long-running progress/completion/failure updates
- [ ] Generated artifact links
- [ ] Webhook route
- [ ] Restart continuation: channel
- [ ] Restart continuation: DM
- [ ] Restart continuation: subscribed thread

Blockers / rollback path:
```

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
