# Discord Interface

Connects your brain to Discord. Users can chat with the brain by mentioning the bot in any server channel (creates a thread for the reply) or by sending it a direct message.

## Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** — give it a name (e.g. "Ranger" or "Rizom Brain")
3. Left sidebar → **Bot** → **Add Bot**
4. Under **TOKEN** → click **Reset Token** → copy it
5. Save the token as `DISCORD_BOT_TOKEN` in your `.env`

### 2. Enable Privileged Gateway Intents

In the Bot settings page, scroll to **Privileged Gateway Intents** and enable:

- **Message Content Intent** — required to read message text

(The bot also uses `Guilds`, `GuildMessages`, and `DirectMessages` intents, which are non-privileged and don't need manual enabling.)

### 3. Invite the Bot to Your Server

1. Left sidebar → **OAuth2 → URL Generator**
2. Scopes: check `bot`
3. Bot permissions: check all of the following:
   - `View Channels`
   - `Send Messages`
   - `Send Messages in Threads`
   - `Create Public Threads`
   - `Read Message History`
4. Copy the generated URL and open it in your browser to invite the bot

### 4. Wire Up the Config

```typescript
import { DiscordInterface } from "@brains/discord";

new DiscordInterface({
  botToken: process.env["DISCORD_BOT_TOKEN"] || "",
});
```

Add your Discord user ID to the brain's `permissions.anchors` to get full access:

```typescript
permissions: {
  anchors: ["discord:YOUR_DISCORD_USER_ID"],
  rules: [
    { pattern: "discord:*", level: "public" },
  ],
}
```

To find your user ID: Discord → Settings → Advanced → enable Developer Mode, then right-click your username → **Copy User ID**.

## Configuration Options

| Option                | Default                | Description                                            |
| --------------------- | ---------------------- | ------------------------------------------------------ |
| `botToken`            | required               | Discord bot token                                      |
| `requireMention`      | `true`                 | Only respond when mentioned in server channels         |
| `allowDMs`            | `true`                 | Respond to direct messages                             |
| `useThreads`          | `true`                 | Create threads for bot replies in server channels      |
| `threadAutoArchive`   | `1440`                 | Thread auto-archive in minutes (60, 1440, 4320, 10080) |
| `showTypingIndicator` | `true`                 | Show typing indicator while processing                 |
| `statusMessage`       | `"Mention me to chat"` | Status shown on bot's profile                          |
| `allowedChannels`     | `[]` (all)             | Restrict to specific channel IDs                       |

## Environment Variables

| Variable            | Description                                 |
| ------------------- | ------------------------------------------- |
| `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal |
