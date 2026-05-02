import { z } from "@brains/utils";

const MAX_FILE_UPLOAD_SIZE = 100_000;
const TEXT_FILE_EXTENSIONS = [".md", ".txt", ".markdown"];
const TEXT_MIME_TYPES = ["text/plain", "text/markdown", "text/x-markdown"];
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+?(?=[,;:\s]|$)/gi;

export const blockedUrlDomainsDefault = [
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
 * Shared URL capture config schema — spread into any MessageInterfacePlugin config.
 * Interfaces add platform-specific options (e.g. captureUrlEmoji for Discord).
 */
export const urlCaptureConfigSchema = z.object({
  /** Auto-capture URLs shared in channels (without mention) */
  captureUrls: z.boolean().default(false),
  /** Domains to skip for URL auto-capture (meetings, scheduling, media, etc.) */
  blockedUrlDomains: z.array(z.string()).default(blockedUrlDomainsDefault),
});

/** Check if a file is a supported text file for upload. */
export function isUploadableTextFile(
  filename: string,
  mimetype?: string,
): boolean {
  if (mimetype && TEXT_MIME_TYPES.some((type) => mimetype.startsWith(type))) {
    return true;
  }
  return TEXT_FILE_EXTENSIONS.some((extension) =>
    filename.toLowerCase().endsWith(extension),
  );
}

/** Validate file size for upload. */
export function isFileSizeAllowed(size: number): boolean {
  return size <= MAX_FILE_UPLOAD_SIZE;
}

/** Format uploaded file content as an agent message. */
export function formatFileUploadMessage(
  filename: string,
  content: string,
): string {
  return `User uploaded a file "${filename}":\n\n${content}`;
}

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
