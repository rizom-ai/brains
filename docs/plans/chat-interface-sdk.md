# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active planning target for the `@brains/chat` Discord implementation.

The current `interfaces/chat/` package is a working first slice: it wraps the Chat SDK Discord adapter, routes Discord messages into the brain, and covers the core text-chat behaviors needed to trial it beside `@brains/discord`. The next target is feature parity with `interfaces/web-chat` for operator-grade chat workflows, adapted to Discord's interaction model.

This plan is **not** about adding other chat providers. Keep the scope focused on Discord through Chat SDK and the bundled web chat feature set.

## Goal

Make the Discord Chat SDK path feel like the same product surface as web chat for the workflows that matter:

- chat with the brain with the correct permission context;
- upload source material and refer to it naturally in follow-ups;
- review confirmations and results without raw JSON leakage;
- see generation / publishing progress clearly;
- receive generated artifacts in a usable form;
- preserve enough conversation and upload state across restarts to continue work safely.

Where Discord cannot match a browser feature exactly, define the Discord-native equivalent and test that behavior explicitly.

## Current implementation

Implemented on `feat/chat-interface`:

- `interfaces/chat/` package and `@brains/chat` workspace wiring.
- Discord adapter credentials, webhook delegation, and gateway daemon loop.
- Discord-scoped permission lookup using `discord:*`.
- Mention, subscribed-thread, unmentioned-channel, and DM routing controls.
- Allowed-channel gating.
- URL capture with blocklist support.
- Trusted/anchor text attachment ingestion for `.txt`/`.md` style files.
- Confirmation replies with `yes` / `no` / `cancel`.
- Async job progress and completion edits for tracked Discord responses.
- Response chunking for Discord message limits.
- Rover opt-in path: add `chat`, remove `discord`.
- Unit coverage: `interfaces/chat/test/chat-interface.test.ts`.

## Parity gaps against `interfaces/web-chat`

### Uploads and follow-ups

Web chat has durable upload refs, upload download routes, binary/image/PDF support, and follow-up reuse. Discord Chat SDK currently only reads text attachments inline for trusted/anchor users.

Required work:

- Reuse or mirror web chat upload validation policy for text, image, and PDF attachments.
- Store accepted Discord attachments in runtime data, not content `brain-data`.
- Create durable upload refs with filename, media type, size, source channel/thread, uploader, and timestamp.
- Pass durable text/image/PDF refs to the agent as native attachments, matching web chat metadata shape where practical.
- Support follow-up selection by explicit filename.
- Support follow-up selection of the most recent relevant upload.
- Preserve upload refs across restart/session reload.
- Reject unsupported, oversized, spoofed, or binary-as-text uploads with user-visible Discord messages.

Acceptance criteria:

- Discord can upload and reuse text, image, and PDF files in the same classes of follow-up workflows covered by web chat tests.
- Upload behavior is permission-gated and covered by tests for trusted/anchor vs public users.

### Conversation state and sessions

Web chat has browser session management and persisted conversation history. Discord currently relies on thread/channel IDs plus Chat SDK memory state.

Required work:

- Persist Discord conversation mapping/state needed for continuation after restart.
- Persist pending confirmation state enough to avoid unsafe orphaned approvals.
- Decide the Discord-native session model: channel, DM, subscribed thread, or owned bot thread.
- Add restart tests for conversation IDs, upload refs, and pending approvals.

Acceptance criteria:

- A Discord conversation can continue after process restart without losing upload context or confusing approvals.
- The implementation does not require the browser session list/rename/archive UX; Discord thread/channel identity is the session UX.

### Confirmations and result presentation

Web chat renders structured approval/result cards. Discord currently uses plain text confirmation prompts and responses.

Required work:

- Convert structured approval requests into readable Discord messages.
- Avoid exposing raw JSON/tool payloads in Discord responses.
- Summarize successful and failed confirmed actions using the same display rules web chat uses.
- Define behavior for multiple simultaneous approvals in one conversation.

Acceptance criteria:

- Confirmation prompts, success summaries, and failure summaries are human-readable in Discord.
- Multiple pending approvals are safe and deterministic.

### Progress and tool activity

Web chat streams structured progress and active tool status. Discord currently edits tracked messages for job progress/completion.

Required work:

- Map structured progress/tool activity to concise Discord-native updates.
- Avoid noisy message spam during long jobs.
- Keep final completion/error state visible after message edits.
- Ignore progress for unrelated channels/conversations.

Acceptance criteria:

- Long-running generation/publish workflows show understandable live status in Discord.
- Tool activity from other conversations cannot leak into the active Discord thread.

### Generated artifacts

Web chat can display artifact cards and serve generated PDF/image attachments to operators. Discord currently only sends text progress/completion edits.

Required work:

- Detect generated artifact metadata from agent/tool results.
- Post Discord-native artifact summaries with title, type, status, and links or attachments.
- Serve or attach generated images/PDFs when permission allows.
- Report artifact job status clearly when generation is queued, completed, or failed.

Acceptance criteria:

- Discord users can retrieve generated image/PDF artifacts from the chat flow without switching to web chat for the common path.
- Non-operator/public users cannot fetch protected artifacts.

### Auth and permissions

Web chat is operator-authenticated. Discord depends on Discord user/channel permission lookup.

Required work:

- Keep `discord:*` as the permission namespace.
- Test anchor/trusted/public behavior for uploads, artifact access, and confirmations.
- Document expected Discord permission rules for operator-grade use.

Acceptance criteria:

- Sensitive flows are gated at least as strictly as web chat equivalents.
- A public Discord user cannot use operator-only upload/artifact flows.

## Non-goals for this plan

- Adding other chat providers.
- Replacing the browser web chat UI.
- Building a shared hosted Discord bot gateway.
- Recreating browser-only UI affordances such as session sidebars inside Discord.

## Implementation order

1. **Inventory and contracts**
   - Make a checklist from `interfaces/web-chat/test/*` and mark each behavior as: same behavior, Discord-native equivalent, or not applicable.
   - Identify reusable upload/artifact display helpers that can move out of web-chat-specific files without creating browser dependencies.

2. **Durable Discord upload refs**
   - Add runtime upload storage for Discord attachments.
   - Support text, image, and PDF uploads.
   - Pass refs to the agent using the same attachment metadata vocabulary as web chat.

3. **Follow-up reuse**
   - Track recent durable uploads by conversation.
   - Implement filename and most-recent selection.
   - Add restart coverage.

4. **Confirmation/result formatting**
   - Port web chat's raw-JSON avoidance and result summarization rules into Discord-readable messages.
   - Harden multiple-approval behavior.

5. **Progress and artifacts**
   - Improve Discord progress updates from structured tool/job events.
   - Post artifact summaries and expose generated PDFs/images safely.

6. **Rover trial path**
   - Keep `@brains/chat` opt-in until live validation passes.
   - Document exact Rover config for replacing `discord` with `chat` during trials.
   - Run live Discord validation for gateway, webhooks, mentions, threads, uploads, progress edits, and generated artifacts.

7. **Replacement decision**
   - Once parity and live validation pass, decide whether Rover presets should switch from `@brains/discord` to `@brains/chat`.
   - Keep rollback instructions for returning to `@brains/discord`.

## Validation

Targeted checks before considering the plan complete:

- `cd interfaces/chat && bun run typecheck`
- `cd interfaces/chat && bun test`
- Add parity tests based on the web chat upload/session/artifact cases.
- Live Discord smoke test with:
  - mention routing;
  - DM routing;
  - thread subscription;
  - text/image/PDF uploads;
  - upload follow-up by filename and by recency;
  - confirmation approval/cancel;
  - long-running generation progress;
  - generated image/PDF artifact retrieval;
  - webhook route handling;
  - restart continuation.

## Completion criteria

This plan is complete when:

- Discord via `@brains/chat` covers the web chat workflow classes listed above, with Discord-native UX where needed.
- Durable upload and conversation state survives restart for supported flows.
- Protected upload/artifact/confirmation flows are permission-gated.
- Live Discord validation passes.
- Rover can safely choose `@brains/chat` as its Discord implementation, or the remaining blocker is explicitly documented with a rollback path.
