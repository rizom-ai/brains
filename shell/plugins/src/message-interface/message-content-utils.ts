import { z } from "@brains/utils/zod";
import type { PermissionLookupContext } from "@brains/templates";
import type { AgentNamespace } from "../contracts/agent";
import type { IPermissionsNamespace } from "../interface/context";

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+?(?=[,;:\s]|$)/gi;

export const blockedUrlDomainsDefault: string[] = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "whereby.com",
  "gather.town",
  "calendly.com",
  "cal.com",
  "discord.com",
  "discord.gg",
  "cdn.discordapp.com",
  "media.discordapp.net",
  "giphy.com",
  "tenor.com",
  "wetransfer.com",
  "file.io",
];

/**
 * Shared URL capture config schema — spread into a message interface's config.
 * Interfaces add platform-specific options (e.g. captureUrlEmoji for Discord).
 */
export const urlCaptureConfigSchema: z.ZodObject<{
  captureUrls: z.ZodDefault<z.ZodBoolean>;
  blockedUrlDomains: z.ZodDefault<z.ZodArray<z.ZodString>>;
}> = z.object({
  /** Auto-capture URLs shared in channels (without mention) */
  captureUrls: z.boolean().default(false),
  /** Domains to skip for URL auto-capture (meetings, scheduling, media, etc.) */
  blockedUrlDomains: z.array(z.string()).default(blockedUrlDomainsDefault),
});

/** Extract HTTP(S) URLs from message content, filtering blocked domains. */
export function extractCaptureableUrls(
  content: string,
  blockedDomains: string[],
): string[] {
  const matches = content.match(URL_PATTERN) ?? [];
  return [...new Set(matches)].filter((url) => {
    try {
      const { hostname } = new URL(url);
      return !blockedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      );
    } catch {
      return false;
    }
  });
}

/** What saving a link through the agent asks: the caller's level and a turn. */
export interface LinkCaptureHost {
  readonly agent: Pick<AgentNamespace, "chat">;
  readonly permissions: Pick<IPermissionsNamespace, "getUserLevel">;
}

/**
 * Save a URL via the agent (delegates to system_create for entityType link).
 * Silent — no reply sent. Uses a dedicated conversation ID to avoid polluting
 * the user's chat history.
 */
export async function captureUrlViaAgent(
  host: LinkCaptureHost,
  url: string,
  channelId: string,
  authorId: string,
  interfaceType: string,
  permissionContext?: PermissionLookupContext,
): Promise<void> {
  const userPermissionLevel = host.permissions.getUserLevel(
    interfaceType,
    authorId,
    permissionContext,
  );
  await host.agent.chat(`Save this link: ${url}`, `links-${channelId}`, {
    userPermissionLevel,
    interfaceType,
    channelId,
  });
}
