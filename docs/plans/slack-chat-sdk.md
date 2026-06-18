# Plan: Slack Chat SDK Interface

## Status

Proposed. Save this as a separate Slack plan, independent of the Discord parity/replacement work.

Goal: add Slack support through `@brains/chat` using Vercel Chat SDK, while reusing the Discord/web-chat parity helpers where they are already transport-neutral.

## Scope

Slack is a new platform adapter in `interfaces/chat`, not a reason to reopen broad multi-provider planning. The first slice should prove Slack routing and operator workflows without changing the existing Discord behavior.

Initial target:

- single-workspace Slack app support;
- webhook mode first;
- optional socket mode later, only if deployment needs it;
- Slack permission namespace uses `slack:*`;
- runtime state persists only Slack thread subscriptions, matching the Discord subscription-only policy;
- locks, queues, caches, OAuth installs, and other operational state remain transient unless a later slice explicitly needs durable state.

## Discovery notes

Chat SDK has a published Slack adapter:

- package: `@chat-adapter/slack`
- matching current Chat SDK version: `4.29.0`
- main factory: `createSlackAdapter(config?)`
- single-workspace env/config:
  - `SLACK_BOT_TOKEN`
  - `SLACK_SIGNING_SECRET`
- socket mode config, if needed later:
  - `mode: "socket"`
  - `SLACK_APP_TOKEN`
  - optional `SLACK_SOCKET_FORWARDING_SECRET`
- multi-workspace OAuth exists in the adapter, but is out of scope for the first slice.

Slack app scopes from the adapter docs likely needed for parity smoke tests:

- `app_mentions:read`
- `channels:history`, `channels:read`
- `groups:history`, `groups:read`
- `im:history`, `im:read`
- `mpim:history`, `mpim:read`
- `chat:write`
- `reactions:read`, `reactions:write`
- `users:read`

If upload/file ingestion is added, confirm whether `files:read` is required for private Slack file URLs before implementing.

## Proposed implementation slices

### 1. Add Slack adapter wiring

- Add `@chat-adapter/slack` to `interfaces/chat` dependencies.
- Extend `chatConfigSchema.adapters` with `slack` config.
- Create a Slack adapter when configured.
- Register `/api/webhooks/chat/slack` and delegate to `app.webhooks.slack`.
- Keep Discord routes and behavior unchanged.
- Add tests for configured/unconfigured Slack adapter and webhook route behavior.

Acceptance criteria:

- `@brains/chat` can initialize with only Slack, only Discord, both, or neither.
- Missing Slack config does not register a working Slack webhook.
- Discord tests still pass unchanged.

### 2. Route Slack messages to the agent

- Treat `slack` as a first-class `ChatPlatform`.
- Use conversation ids based on Chat SDK Slack thread ids.
- Use permission lookup namespace `slack` with actor ids from Slack user ids.
- Support Slack app mentions and subscribed-thread follow-ups.
- Support DMs if enabled in config.
- Add optional allowed-channel gating.

Acceptance criteria:

- Mention routing calls `AgentService.chat` with Slack channel/thread context.
- Subscribed-thread routing works in tests.
- Public/trusted/anchor permission levels resolve via `slack:*` rules.
- Slack messages from the bot itself are ignored.

### 3. Persist Slack thread subscriptions

- Generalize the Discord subscription state adapter or add a Slack equivalent.
- Use shell runtime state with a distinct namespace, e.g. `chat.slack.subscriptions`.
- Persist only `subscribe`, `unsubscribe`, and `isSubscribed`.
- Delegate all other Chat SDK state operations to memory.

Acceptance criteria:

- Slack subscribed-thread routing can survive adapter recreation in tests.
- Runtime-state namespace is documented and tested.
- No Slack state is stored in conversation/message metadata or local files.

### 4. Slack uploads and attachment policy

- Determine how Chat SDK exposes Slack file metadata and private download URLs.
- Add Slack upload fetching only for trusted/anchor callers.
- Store source uploads through the shared runtime upload registry with a Slack-specific scope.
- Reuse shared upload validation/selection helpers.
- Add a Slack upload route only if needed for durable upload refs, with the same no-store/nosniff/content-disposition guardrails as Discord.

Acceptance criteria:

- Public Slack users cannot cause files to be fetched or reused.
- Trusted/anchor text/image/PDF uploads become native agent attachments.
- Follow-up reuse by filename/recency works if Slack exposes enough filename metadata.

### 5. Confirmations, progress, and artifacts

- Reuse text-based approval replies first (`yes`, `no`, explicit approval ids).
- Defer Slack Block Kit approval buttons until the text parity path is stable.
- Reuse message editing for progress/status where Slack adapter supports edits.
- Reuse generated artifact summary and visibility-suppression policy.
- Native Slack artifact upload can be a later enhancement after basic link fallback is safe.

Acceptance criteria:

- Confirmation approve/cancel and multi-approval id flows work in Slack tests.
- Progress messages update or fall back safely.
- Generated artifact fallback links never expose out-of-scope stored artifacts.

### 6. Live Slack trial

Run a real Slack app trial after automated tests pass.

Smoke checks:

- app mention routing;
- DM routing;
- subscribed thread follow-up after restart;
- allowed-channel gating;
- public vs trusted permission behavior;
- text/image/PDF uploads, if implemented;
- confirmation approve/cancel;
- multiple/bad-id approval flows;
- progress/completion/failure edits;
- generated artifact fallback policy;
- webhook verification.

## Non-goals for first Slack slice

- Multi-workspace OAuth installs.
- Slack Socket Mode unless webhook deployment is not viable.
- Slack Block Kit-native approval buttons.
- Hosted shared Slack gateway.
- Reworking Discord parity or Rover migration decisions.
- Durable Chat SDK locks/queues/cache/list state.

## Validation commands

Use focused checks per slice:

- `cd interfaces/chat && bun run typecheck`
- `cd interfaces/chat && bun test`
- `cd interfaces/chat && bun run lint`

Run broader workspace checks only when shared contracts, runtime state, package exports, or migrations change.
