# @brains/chat

Multi-platform Chat SDK interface for Brains.

## Status

The chat transport for every brain, replacing the standalone `@brains/discord` interface. Discord is fully supported; Slack support covers a single workspace. Discord and Slack can be configured independently or enabled together in one interface instance.

## Discord configuration

The Chat SDK Discord adapter requires an existing Discord application/bot. It does **not** create bots for you.

Required credentials:

- `DISCORD_BOT_TOKEN`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_APPLICATION_ID`

Example brain model mapping:

```ts
[
  "chat",
  ChatInterface,
  (env) => ({
    adapters: {
      discord:
        env["DISCORD_BOT_TOKEN"] &&
        env["DISCORD_PUBLIC_KEY"] &&
        env["DISCORD_APPLICATION_ID"]
          ? {
              botToken: env["DISCORD_BOT_TOKEN"],
              publicKey: env["DISCORD_PUBLIC_KEY"],
              applicationId: env["DISCORD_APPLICATION_ID"],
            }
          : undefined,
    },
  }),
];
```

Example `brain.yaml` config:

```yaml
plugins:
  chat:
    adapters:
      discord:
        requireMention: true
        allowDMs: true
        useThreads: true
        captureUrls: true
```

## Slack configuration

Slack supports a single workspace in either webhook or Socket Mode. Create the app from [`slack-app-manifest.yaml`](./slack-app-manifest.yaml), which declares the supported events and scopes, including `files:read` for incoming uploads and `files:write` for native generated-artifact delivery.

For local testing, authorize/install the app in the test workspace, then create an app-level `xapp-...` token with `connections:write`. The manifest enables Socket Mode.

The dedicated Rover trial validates credentials and starts with one command:

```bash
export SLACK_BOT_TOKEN='xoxb-...'
export SLACK_APP_TOKEN='xapp-...'
export AI_API_KEY='...'
export GIT_SYNC_TOKEN='...'

cd brains/rover
bun start:slack
```

The preflight calls `auth.test`, validates Socket Mode, and probes file, conversation, and user access without printing tokens or socket URLs. Workspace authorization, app installation, and app-token creation remain one-time Slack-approved steps. Reapply the manifest after updates so Socket Mode interactivity remains enabled for native confirmation cards.

The dedicated test app configuration is:

```yaml
plugins:
  chat:
    adapters:
      slack:
        mode: socket
        botToken: ${SLACK_BOT_TOKEN}
        appToken: ${SLACK_APP_TOKEN}
        requireMention: true
        allowDMs: true
        allowedChannels: []
```

Socket Mode processes events directly and does not require a signing secret, public URL, or webhook tunnel.

For a publicly reachable webhook deployment, configure:

```yaml
plugins:
  chat:
    adapters:
      slack:
        mode: webhook
        botToken: ${SLACK_BOT_TOKEN}
        signingSecret: ${SLACK_SIGNING_SECRET}
        requireMention: true
        allowDMs: true
        allowedChannels: []
```

Point Slack event subscriptions at:

```text
POST /api/webhooks/chat/slack
```

Subscribe to `app_mention`, `message.channels`, `message.groups`, `message.im`, and `message.mpim`. Webhook Mode verifies Slack signatures and rejects stale or invalid requests. In Socket Mode, enable the same events but leave their Request URL unset.

Permission rules remain platform-scoped and can coexist:

```yaml
permissions:
  rules:
    - pattern: "discord:*"
      level: trusted
    - pattern: "slack:*"
      level: trusted
```

When a brain model adopts this package, add `"chat"` to `evalDisable` so live chat sockets/webhooks do not start during evaluation runs.

## Platform permission guidance

Use `discord:*` and `slack:*` permission rules for their respective adapters. Operator-grade deployments should prefer:

- `requireMention: true` so ordinary channel chatter is not routed as commands.
- `allowedChannels` for production channels where the bot may respond or capture URLs.
- `allowDMs: false` unless direct operator DMs are intentionally supported.
- `trusted` or `admin` only for users/channels that may upload source files or resolve prior upload context.

Upload handling is permission-gated before download: public users can still chat, but their Discord or Slack attachments are not fetched or passed to the agent. Confirmation safety is enforced by the agent permission layer and explicit approval-id selection when multiple approvals are pending.

## Stored upload policy (0.3)

Discord and Slack source uploads use canonical `upload` references, retaining platform, sender and message metadata. Only trusted/admin callers can capture or restore attachments; public users cannot cause them to be fetched or reused. Native capture and inspection precede retention, and AI consumers borrow files rather than receiving controller buffers.

The old `/api/webhooks/chat/discord/uploads` and `/api/webhooks/chat/slack/uploads` download routes are removed. Historical `discord-chat-upload` and `slack-chat-upload` references are not restored or copied into the canonical store. Existing retained files are not deleted by this change. New canonical references remain usable across turns and restarts; authenticated browser downloads belong to Web Chat's upload surface, not public platform download routes.

Generated image/PDF artifact cards are posted as native Discord files for trusted/admin users when the card can be resolved to a stored `image` or `document` entity visible to that permission level. Link summaries remain as the only fallback; this package does not add signed or Discord-authenticated artifact routes. When the resolved artifact exists but is out of the caller's visibility scope, its link and metadata are suppressed so fallback links never expose protected artifacts. Public users do not receive native protected artifact files or fallback links to shared/restricted generated artifacts.

## Current test coverage

Slack's initial slice covers:

- Slack-only, Discord-only, combined, and unconfigured adapter wiring;
- webhook verification/delegation and unconfigured-route rejection;
- abortable Socket Mode lifecycle, webhook suppression, and coexistence with the Discord gateway;
- app mentions, DMs, allowed-channel policy, permission attribution, and subscribed-thread follow-ups;
- isolated durable Discord and Slack subscription namespaces;
- self/bot filtering through the shared routing policy;
- trusted/admin-only authenticated text, image, and PDF ingestion, durable canonical follow-up reuse, and absence of legacy upload routes;
- Slack's 4000-character response chunking.

Slack Block Kit actions, native artifact delivery, and a live workspace trial remain pending.

Discord parity coverage includes:

- Discord adapter credentials and subscription-state wiring
- no chat adapter or daemon registration when none is configured
- unsupported Chat SDK threads ignored
- Discord-scoped permission lookup (`discord:*`, not `chat:*`)
- mentions and subscribed thread routing
- existing Discord thread safety: a mention inside an arbitrary existing thread gets a one-time response but does not subscribe the thread, and subscribed-message routing is gated by the persisted subscription record
- thread subscription policy when `useThreads` is disabled or subscription fails
- typing indicator policy when `showTypingIndicator` is disabled
- unmentioned channel routing when `requireMention: false`
- DMs with `allowDMs`
- allowed-channel gating for chat, URL capture, and thread subscription
- URL capture, disabled URL capture, and blocked domains
- self-message filtering, plus bot-message filtering unless mentioned, including passive URL capture
- trusted/admin-only text, image, and PDF uploads as durable native agent attachments with Discord source metadata
- prior upload follow-up reuse by filename, first/oldest, or most-recent wording, including restart reload from stored conversation metadata
- queued Discord input handling so busy-thread messages are not silently dropped; earlier queued messages are preserved as coalesced context for the latest queued turn
- user-visible skipped-upload notices for unsupported, oversized, or spoofed uploads using shared message-interface upload policy
- yes/no/cancel confirmation flow with readable pending-approval instructions, SDK approval cards with Confirm/Cancel buttons for single pending approvals, card-based confirmation result summaries, chained approvals, remaining-approval reminders, retry after confirmation errors, restart reload from stored approval cards, unrecognized replies, and exact approval-id selection for multiple pending approvals
- agent error responses
- structured artifact, approval, source, action, and confirmation result summaries formatted with shared message-interface display rules without raw JSON leakage, including SDK artifact/source cards with link buttons for absolute URLs, prompt-action buttons for suggested actions, disabled unavailable buttons for event actions, stale suggested-action notices after restart, suppression of relative/localhost browser links in Discord summaries, and visibility-scoped native Discord file posting for trusted/Admin generated image/PDF artifacts returned by chat or confirmations, with link/metadata suppression for artifacts out of the caller's visibility scope
- live tool activity status cards edited in place, with failed-tool fallback cards
- async job progress, completion, and failure cards for tracked tool-result or artifact-card responses and standalone progress messages
- platform response chunking for Discord's 2000-character limit
- Discord webhook route delegation
- removed legacy upload routes and ignored historical platform upload references
- abortable direct-mode gateway loop

## Runtime state policy

Discord and Slack thread subscriptions are persisted independently through `chat.discord.subscriptions` and `chat.slack.subscriptions` so subscribed-thread routing can survive restart without cross-platform reads or writes. Source uploads use the canonical `upload` scope with platform attribution; conversation continuity remains platform-specific. Subscribed-message routing uses that same subscription record as the ownership gate. Subscription records also persist mention-required routing policy for threads that become multi-human discussions, including whether the one-time notice has already been sent. Chat SDK locks, queues, caches, lists, suggested-action callback tokens, OAuth installations, and other operational state remain memory-backed.

If native Discord file delivery fails after a validated response, `ReceivedDiscordFileDeliveryError` retains only message, channel and attachment IDs plus the original cause. It is not completed delivery or permission to retry. The artifact scope keeps earlier completed cards, does not mark the received-only card delivered, joins the loan and stops later sends. This error is recovery evidence, not a durable journal or automatic replay mechanism.

Slack failures after validated initialization retain `PartialSlackFileDeliveryError.recovery`: the allocated file ID, bound channel/thread, source digest and last known stage. Stages distinguish initialization, a received upload response, a completed byte upload, a share attempt and a validated share response. A mismatched share response retains its returned file ID separately. None of these failure states marks an artifact delivered or authorizes replay; signed upload URLs, local paths and filenames are not copied into recovery metadata. The original cause remains available.

Suggested-action button tokens are intentionally not durable: they reference in-memory prompts instead of embedding prompt text in Discord component payloads. After restart, clicking an old suggested-action button returns an "Action unavailable" notice and does not call the agent.

## Known gaps

- HTTP Discord webhook/interactions endpoint validation is conditional. Test it only when a deployment explicitly configures a Discord Interactions Endpoint URL or a shared gateway forwarder; gateway-mode deployments do not need it.
- Public/external access to protected generated artifacts is intentionally not implemented; fallback links are only rendered when they do not point at an out-of-scope stored artifact.
- Shared gateway mode is not implemented here yet.
