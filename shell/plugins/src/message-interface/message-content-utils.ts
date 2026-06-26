import { z } from "@brains/utils/zod-v4";

/** Maximum size (in bytes) for an uploaded text file. */
export const maxFileUploadBytes = 100_000;
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
  return size <= maxFileUploadBytes;
}

/**
 * Heuristic check that a byte buffer is decodable UTF-8 text rather than
 * binary content. Guards against clients that upload binary payloads under a
 * text filename or spoofed text MIME type.
 */
export function isLikelyTextContent(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
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
