# @brains/chat

Unified Chat SDK interface for Brains.

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

## Current Discord parity coverage

Covered by tests:

- Discord adapter credentials and memory state wiring
- no Discord adapter or daemon registration when Discord is not configured
- non-Discord Chat SDK threads ignored until those adapters are enabled
- platform-scoped permission lookup (`discord:*`, not `chat:*`)
- mentions and subscribed thread routing
- thread subscription policy when `useThreads` is disabled
- typing indicator policy when `showTypingIndicator` is disabled
- unmentioned channel routing when `requireMention: false`
- DMs with `allowDMs`
- allowed-channel gating for chat and URL capture
- URL capture, disabled URL capture, and blocked domains
- bot-message filtering unless mentioned, including passive URL capture
- trusted text-file uploads plus unsupported/oversized upload filtering
- yes/no/cancel confirmation flow, including unrecognized replies
- agent error responses
- async job progress and completion edits for tracked responses
- platform response chunking for Discord's 2000-character limit
- Discord webhook route delegation
- abortable direct-mode gateway loop

## Known gaps before replacing `@brains/discord`

- Chat SDK memory state is used in this first slice. Subscribed/owned-thread behavior does not survive restart yet.
- Live Discord validation is still required for mention gating, thread creation/follow-up behavior, typing indicators, upload behavior, progress edits, and webhooks.
- Shared gateway mode is not implemented here yet.
- Matrix/Slack are represented in platform contracts but not enabled.
