---
"@rizom/brain": minor
---

Retire the standalone Discord interface. `chat` is now the single chat transport for Rover, Ranger, and Relay, covering both Discord and Slack through the Chat SDK, and the Discord adapter wires itself up from `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and `DISCORD_APPLICATION_ID`.

**Breaking for instances that configured `plugins.discord`.** The interface id `discord` no longer exists; move its settings under `plugins.chat.adapters.discord` and supply the two additional credentials, which the Chat SDK adapter requires:

```yaml
plugins:
  chat:
    adapters:
      discord:
        botToken: ${DISCORD_BOT_TOKEN}
        publicKey: ${DISCORD_PUBLIC_KEY}
        applicationId: ${DISCORD_APPLICATION_ID}
```

Permission rules and space selectors are unaffected — messages still arrive under the `discord:` namespace. Relay also declares the chat env vars for the first time, so its generated `env.schema.template` and `secrets push` candidates now include the Discord and Slack credentials it was already using.
