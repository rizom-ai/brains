# Plan: Slack Chat SDK Interface

## Status

Ready for one-time Slack provisioning and a live trial. Reviewed against the current `interfaces/chat` implementation and published Slack adapter documentation on 2026-07-12. Webhook and Socket Mode wiring, routing, platform-isolated subscription persistence, text-based confirmations, progress fallbacks, permission-gated uploads, and the programmatic local-trial harness are implemented; live validation remains.

Keep this as a separate Slack plan, independent of the Discord parity/replacement work.

Goal: add Slack support through `@brains/chat` using Vercel Chat SDK, while reusing the transport-neutral workflows already extracted from the Discord/web-chat implementation.

## Scope

Slack is a new platform adapter in `interfaces/chat`, not a reason to reopen broad multi-provider planning. The first slice should prove Slack routing and operator workflows without changing the existing Discord behavior.

Initial target:

- single-workspace Slack app support;
- webhook mode for publicly reachable deployments;
- Socket Mode for local and direct-process deployments without a public webhook;
- Slack permission namespace uses `slack:*`;
- runtime state persists only Slack thread subscriptions, matching the Discord subscription-only policy;
- locks, queues, caches, OAuth installs, and other operational state remain transient unless a later slice explicitly needs durable state.

## Discovery notes

Chat SDK has a published Slack adapter:

- package: `@chat-adapter/slack`
- main factory: `createSlackAdapter(config?)`
- before implementation, package ranges started at `4.29.0` while the lockfile already resolved the Chat SDK packages to `4.33.0`;
- the Slack slice aligns the declared `chat`, Discord, memory-state, and Slack adapter ranges at `4.33.0`; adapter versions must continue to move together;
- single-workspace env/config:
  - `SLACK_BOT_TOKEN`
  - `SLACK_SIGNING_SECRET`
- Socket Mode config:
  - `mode: "socket"`
  - `SLACK_APP_TOKEN` with `connections:write`
  - no signing secret or webhook URL is required for direct processing;
  - optional `SLACK_SOCKET_FORWARDING_SECRET` applies only to serverless forwarding mode, which remains out of scope;
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
- `files:read` when upload ingestion is enabled

The Slack adapter exposes `fetchData()` for private files and performs the download with the bot token. Slack returns an HTML login page without `files:read`, so the scope is required for upload ingestion.

## Starting implementation constraints

The transport-neutral middle of `interfaces/chat` was already reusable: `MessageInterfacePlugin`, `SubscriptionRouter`, `ChatInputBuilder`, response planning, progress handling, approval handling, and upload selection provided the right base for Slack.

At the start of this work, the outer Chat SDK integration was intentionally Discord-specific:

- `ChatPlatform`, adapter maps, webhook maps, ownership checks, and message limits only know `discord`;
- `DiscordChatApp` and `createDiscordChatSdkApp` own app construction and lifecycle;
- `SubscriptionRouter` injects bot-created-thread detection but still hard-codes Discord platform and state names;
- the durable state adapter writes every Chat SDK subscription to `chat.discord.subscriptions`;
- raw-message metadata guards, gateway handling, component REST calls, and upload URLs are Discord-specific;
- current tests explicitly treat Slack channel ids as unsupported.

Slices 1–3 address these constraints with a small platform-host generalization at the boundary. Do not make the shared workflows lowest-common-denominator abstractions or move Slack-specific metadata parsing into shared packages. Preserve existing Discord behavior and configuration throughout.

## Proposed implementation slices

### 1. Generalize the Chat SDK host and add Slack wiring

- Add `@chat-adapter/slack` at the same compatible version range used by the other Chat SDK packages.
- Extend `chatConfigSchema.adapters` with single-workspace Slack credentials and routing options: bot token, webhook signing secret or Socket Mode app token, allowed channels, mention policy, and DM policy.
- Generalize the internal Discord-only app construction/types just enough to host Discord and Slack adapters together. Keep the Discord gateway loop and component REST client platform-specific.
- Treat `slack` as a first-class `ChatPlatform`; update adapter/webhook maps and platform ownership checks without weakening interface ownership filtering.
- Create a Slack adapter only when configured.
- Register `/api/webhooks/chat/slack` and delegate to `app.webhooks.slack`; keep `/api/webhooks/chat/discord` and the Discord gateway behavior unchanged.
- Do not read Slack credentials implicitly from the environment inside shared code; pass schema-validated configuration to the adapter.
- Add configured/unconfigured, webhook verification, and adapter-combination tests.

Acceptance criteria:

- `@brains/chat` can initialize with only Slack, only Discord, both, or neither.
- Missing Slack config does not expose a functioning Slack webhook.
- Invalid Slack signatures are rejected by the adapter.
- Discord behavior and tests remain unchanged.
- Chat SDK package versions are aligned.

### 2. Route Slack messages to the agent

- Use conversation ids based on the opaque Chat SDK Slack thread ids; do not duplicate Slack id parsing when the adapter already provides normalized thread/message fields.
- Use permission lookup namespace `slack` with actor ids from Slack user ids.
- Add Slack-specific, guarded raw-message metadata extraction only where normalized Chat SDK fields are insufficient.
- Reuse the shared input, response, progress, attribution, URL-capture, and subscription-routing workflows.
- Generalize `SubscriptionRouter` platform/state naming and inject Slack-specific owned-thread detection instead of adding Slack branches to shared policy.
- Support Slack app mentions and subscribed-thread follow-ups.
- Support DMs when enabled and optional allowed-channel gating.
- Ignore messages from the bot itself and other event shapes that could cause reply loops.

Acceptance criteria:

- Mention routing calls `AgentService.chat` with Slack channel/thread context.
- Subscribed-thread routing works in tests.
- Public/trusted/anchor permission levels resolve through `slack:*` rules.
- Allowed-channel and DM policies are enforced.
- Slack messages from the bot itself are ignored.
- Discord event routing remains unchanged.

### 3. Make subscription persistence platform-aware

- Replace the Discord-only Chat SDK subscription state adapter with a platform-aware adapter, or compose equivalent per-platform stores.
- Preserve the existing `chat.discord.subscriptions` namespace and use `chat.slack.subscriptions` for Slack.
- Dispatch by the opaque thread id's known platform prefix at the state boundary; unknown platforms must not fall into the Discord namespace.
- Persist only subscription records and their routing policy (`subscribe`, `unsubscribe`, `isSubscribed`, and the existing mention-required state).
- Delegate locks, queues, cache, lists, OAuth installations, and other Chat SDK state operations to memory.

Acceptance criteria:

- Discord and Slack subscriptions survive adapter recreation independently.
- Running both adapters cannot read, overwrite, or delete the other platform's subscriptions.
- Existing Discord runtime state remains compatible.
- Runtime-state namespaces are documented and tested.
- No Slack state is stored in conversation/message metadata or local files.

### 4. Slack uploads and attachment policy

- Use the pinned Chat SDK adapter's normalized file metadata and authenticated `fetchData()` callback; do not assume Discord attachment shapes or fetch `url_private` directly.
- Require the `files:read` Slack scope.
- Invoke authenticated Slack upload fetching only for trusted/anchor callers.
- Store source uploads through the shared runtime upload registry with a Slack-specific scope.
- Reuse shared upload validation/selection helpers.
- Add a Slack upload route only if needed for durable upload refs, with the same no-store/nosniff/content-disposition guardrails as Discord.

Acceptance criteria:

- Public Slack users cannot cause files to be fetched or reused.
- Trusted/anchor text/image/PDF uploads become native agent attachments.
- Follow-up reuse by filename/recency works if Slack exposes enough filename metadata.

### 5. Confirmations, progress, and artifacts

- Reuse the shared response plan and text-based approval replies first (`yes`, `no`, explicit approval ids).
- Keep Discord component actions isolated; defer Slack Block Kit approval buttons until the text parity path is stable.
- Reuse message editing for progress/status where the Slack adapter supports edits, with the existing safe fallback when it does not.
- Reuse generated artifact summary and visibility-suppression policy.
- Native Slack artifact upload can be a later enhancement after basic link fallback is safe.

Acceptance criteria:

- Confirmation approve/cancel and multi-approval id flows work in Slack tests.
- Progress messages update or fall back safely.
- Generated artifact fallback links never expose out-of-scope stored artifacts.

### 6. Add a programmatic local-trial harness

Make the first live trial reproducible without editing an existing Rover test app or exposing a webhook.

- Commit a Slack app manifest for the supported single-workspace Socket Mode configuration, including bot scopes, events, `socket_mode_enabled`, and the `connections:write` app-token requirement.
- Add a dedicated Rover Slack test app at `brains/rover/test-apps/slack/brain.yaml` that opts into `chat`, removes the legacy Discord interface, configures `mode: socket`, and keeps credentials in environment interpolation only.
- Add a documented `bun start:slack` Rover script that uses the same model-owned startup path as the existing preset test apps.
- Add a preflight command that checks required Slack environment variables without printing values, calls Slack `auth.test`, reports the app/workspace identity, validates Socket Mode, and fails clearly for missing scopes or invalid credentials. Normal Rover startup remains responsible for model-wide credentials such as `AI_API_KEY`.
- Keep the default smoke flow operator-driven from Slack. A fully automated message/file sender is optional and must require a separate, explicitly supplied test-user token; never make a user token part of normal setup.
- Document the one-time manual boundary: workspace authorization/app installation and creation of the `xapp-...` app-level token require Slack approval.
- Never generate, copy, log, or commit Slack credentials.

Acceptance criteria:

- A developer can provision/update the app from the committed manifest using Slack's app-manifest workflow after authenticating to a workspace.
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `AI_API_KEY`, and other required model credentials can be supplied through the shell or an ignored local env file; non-secret Slack permission policy stays in `brain.yaml`.
- One command starts the dedicated Rover Slack test app without modifying another tracked test config.
- Preflight verifies credentials and app identity without exposing secrets.
- Missing credentials fail before Rover startup with actionable messages.

### 7. Live Slack trial

Run a real Slack app trial after the programmatic harness and automated tests pass. Automated tests cover valid and invalid Slack request signatures plus abortable Socket Mode lifecycle. Use Socket Mode for the first local trial so only real workspace credentials and the one-time Slack workspace approval are required; a publicly reachable webhook is optional.

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
- Serverless Socket Mode forwarding or a hosted socket gateway.
- Automating Slack workspace consent, bypassing app-install approval, or storing operator/test-user credentials.
- A required test-user token for the normal local trial path.
- Slack Block Kit-native approval buttons.
- Hosted shared Slack gateway.
- Reworking Discord parity or Rover migration decisions.
- Durable Chat SDK locks/queues/cache/list or OAuth installation state.
- A broad rewrite of the working Discord-specific gateway, component, or upload implementations.
- Unrelated Chat SDK dependency churn after the coordinated `4.33.0` alignment.

## Validation commands

Use focused checks per slice:

- `cd interfaces/chat && bun run typecheck`
- `cd interfaces/chat && bun test`
- `cd interfaces/chat && bun run lint`
- `cd brains/rover && bun test test/chat-interface-opt-in.test.ts`
- run the Slack preflight command with intentionally missing credentials and confirm it fails safely

Run broader workspace checks only when shared contracts, runtime state, package exports, or migrations change.
