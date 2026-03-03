# Plan: URL Auto-Capture Feature

## Context

Users share URLs in Discord channels. The bot should silently save them as links
(via the existing `link_capture` tool) and react with a 🔖 emoji — without requiring
an explicit mention. The feature is opt-in and blocked for noisy domains (meetings,
meme sites, temp file hosts, etc.).

**Architecture:** URL extraction and agent delegation belong in `MessageInterfacePlugin`
base class (reusable by Matrix/CLI later). Emoji reaction is Discord-specific.
The `link_capture` tool in `@brains/link` already handles dedup via deterministic entity IDs.

## Changes

### Step 1: Write failing tests first

**File**: `interfaces/discord/test/discord-interface.test.ts`

Add `react: mockReact` to `createDiscordMessage` helper. Write URL capture tests:

- Captures URL without mention when `captureUrls: true` → reacts with 🔖 + sends to agent
- No capture when `captureUrls: false` (default)
- No capture for blocked domains (e.g., `meet.google.com`)
- No emoji reaction when bot IS mentioned (normal routing, no URL capture)
- Existing tests unaffected (`captureUrls` defaults to false)

Run `bun test interfaces/discord/` — expect new tests to FAIL.

### Step 2: Add utility methods to MessageInterfacePlugin base class

**File**: `shell/plugins/src/message-interface/message-interface-plugin.ts`

Add after file-upload helpers (~line 97):

```typescript
private static readonly URL_PATTERN =
  /https?:\/\/[^\s<>"{}|\\^`[\]]+?(?=[,;:\s]|$)/gi;

/** Extract HTTP(S) URLs from content, excluding blocked domains */
protected extractCaptureableUrls(content: string, blockedDomains: string[]): string[] {
  const matches = content.match(MessageInterfacePlugin.URL_PATTERN) ?? [];
  return [...new Set(matches)].filter((url) => {
    try {
      const { hostname } = new URL(url);
      return !blockedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
    } catch {
      return false;
    }
  });
}

/** Save a URL via the agent (uses link_capture tool). Silent — no channel reply. */
protected async captureUrlViaAgent(
  url: string,
  channelId: string,
  authorId: string,
  interfaceType: string,
): Promise<void> {
  if (!this.context) return;
  const userPermissionLevel = this.context.permissions.getUserLevel(interfaceType, authorId);
  await this.context.agentService.chat(
    `Save this link: ${url}`,
    `links-${channelId}`,
    { userPermissionLevel, interfaceType, channelId },
  );
}
```

### Step 3: Add URL capture config to Discord

**File**: `interfaces/discord/src/config.ts`

Add three fields:

```typescript
captureUrls: z.boolean().default(false),
captureUrlEmoji: z.string().default("🔖"),
blockedUrlDomains: z.array(z.string()).default([
  "meet.google.com", "zoom.us", "teams.microsoft.com", "whereby.com",
  "gather.town", "calendly.com", "cal.com", "discord.com", "discord.gg",
  "cdn.discordapp.com", "media.discordapp.net", "giphy.com", "tenor.com",
  "wetransfer.com", "file.io",
]),
```

### Step 4: Implement URL capture in Discord handleMessage

**File**: `interfaces/discord/src/discord-interface.ts`

Two changes:

**a) Move `allowedChannels` check before `requireMention`** (so it also gates URL capture):

```typescript
// NEW ORDER: allowedChannels → requireMention (was: requireMention → allowedChannels)
if (
  this.config.allowedChannels.length > 0 &&
  !isDM &&
  !this.config.allowedChannels.includes(message.channel.id)
) {
  return;
}
```

**b) At the requireMention fallback, try URL capture before returning**:

```typescript
if (!isDM && !isOwnThread && this.config.requireMention && !botIsMentioned) {
  if (this.config.captureUrls) {
    const urls = this.extractCaptureableUrls(
      message.content,
      this.config.blockedUrlDomains,
    );
    if (urls.length > 0) {
      await message
        .react(this.config.captureUrlEmoji)
        .catch((e: unknown) => this.logger.debug("React failed", { error: e }));
      for (const url of urls) {
        await this.captureUrlViaAgent(
          url,
          message.channel.id,
          message.author.id,
          "discord",
        ).catch((e: unknown) =>
          this.logger.error("URL capture failed", { error: e, url }),
        );
      }
    }
  }
  return;
}
```

### Step 5: Add linkPlugin to collective-brain

**File**: `apps/collective-brain/brain.config.ts`

```typescript
import { linkPlugin } from "@brains/link";
// ...
linkPlugin({}),
```

## Files

| File                                                              | Change                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `interfaces/discord/test/discord-interface.test.ts`               | Add URL capture tests                                                    |
| `shell/plugins/src/message-interface/message-interface-plugin.ts` | Add `extractCaptureableUrls()`, `captureUrlViaAgent()`                   |
| `interfaces/discord/src/config.ts`                                | Add `captureUrls`, `captureUrlEmoji`, `blockedUrlDomains`                |
| `interfaces/discord/src/discord-interface.ts`                     | Move `allowedChannels` check; add URL capture at requireMention fallback |
| `apps/collective-brain/brain.config.ts`                           | Add `linkPlugin({})`                                                     |

## Key Design Decisions

- **No direct `@brains/link` dependency in Discord** — agent mediates via `link_capture` tool
- **Reusable base class methods** — Matrix/CLI can add URL capture later by calling the same methods
- **Silent operation** — emoji is the only user-visible feedback; agent response is discarded
- **Separate conversation ID** (`links-${channelId}`) — doesn't pollute user's chat conversation
- **Allowlist gates URL capture** — if `allowedChannels` is set, URL capture respects it
- **Bots excluded** — existing bot filter runs before the requireMention block

## Verification

```bash
bun test interfaces/discord/
bun run typecheck
bun run lint
```
