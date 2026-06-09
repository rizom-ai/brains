# @brains/chat

Discord Chat SDK interface for Brains.

## Status

First implementation slice. Discord is the only enabled adapter in this package today. Rover, Ranger, and Relay still use `@brains/discord` until this package reaches full production parity.

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

Permission rules remain platform-scoped:

```yaml
permissions:
  rules:
    - pattern: "discord:*"
      level: trusted
```

When a brain model adopts this package, add `"chat"` to `evalDisable` so live chat sockets/webhooks do not start during evaluation runs.

## Discord permission guidance

Use `discord:*` permission rules for this interface. Operator-grade deployments should prefer:

- `requireMention: true` so ordinary channel chatter is not routed as commands.
- `allowedChannels` for production channels where the bot may respond or capture URLs.
- `allowDMs: false` unless direct operator DMs are intentionally supported.
- `trusted` or `anchor` only for users/channels that may upload source files or resolve prior upload context.

Upload handling is permission-gated before download: public users can still chat, but their Discord attachments are not fetched or passed to the agent. Confirmation safety is enforced by the agent permission layer and by Discord-side approval-id selection when multiple approvals are pending.

## Stored upload route policy

Discord source uploads use runtime upload storage and unguessable `upload-<uuid>` refs. The download route is public because Discord links cannot carry the browser operator session used by web chat. Current guardrails are:

- only trusted/anchor Discord users can create reusable upload refs;
- public Discord users cannot cause attachments to be fetched or reused;
- refs are random UUIDs and runtime uploads are pruned by the shared upload registry;
- route responses serve only stored source uploads, not arbitrary content entities;
- route responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

Treat generated/protected artifact delivery as a separate production decision: prefer signed or authenticated routes before exposing non-public generated PDFs/images outside operator-only contexts.

## Current Discord parity coverage

Covered by tests:

- Discord adapter credentials and memory state wiring
- no Discord adapter or daemon registration when Discord is not configured
- non-Discord Chat SDK threads ignored
- Discord-scoped permission lookup (`discord:*`, not `chat:*`)
- mentions and subscribed thread routing
- thread subscription policy when `useThreads` is disabled
- typing indicator policy when `showTypingIndicator` is disabled
- unmentioned channel routing when `requireMention: false`
- DMs with `allowDMs`
- allowed-channel gating for chat and URL capture
- URL capture, disabled URL capture, and blocked domains
- bot-message filtering unless mentioned, including passive URL capture
- trusted/anchor-only text, image, and PDF uploads as durable native agent attachments with Discord source metadata
- prior upload follow-up reuse by filename, first/oldest, or most-recent wording, including restart reload from stored conversation metadata
- user-visible skipped-upload notices for unsupported, oversized, or spoofed uploads using shared message-interface upload policy
- yes/no/cancel confirmation flow with readable pending-approval instructions, restart reload from stored approval cards, unrecognized replies, and explicit approval-id selection for multiple pending approvals
- agent error responses
- structured artifact, approval, and confirmation result summaries formatted with shared message-interface display rules without raw JSON leakage, including absolute artifact links when a site URL is configured
- live tool activity status messages edited in place, with failed-tool fallback notices
- async job progress and completion edits for tracked responses
- platform response chunking for Discord's 2000-character limit
- Discord webhook route delegation
- stored Discord upload download route
- abortable direct-mode gateway loop

## Known gaps before replacing `@brains/discord`

- Chat SDK adapter state still uses memory state. If live validation shows subscribed-thread state must survive restart, add a DB-backed Chat SDK state adapter in/near the conversation service rather than local file state or conversation metadata.
- Generated artifact delivery is link-only; posting generated files as native Discord attachments is not implemented yet.
- Live Discord validation is still required for mention gating, thread creation/follow-up behavior, typing indicators, upload behavior, progress edits, and webhooks.
- Shared gateway mode is not implemented here yet.
