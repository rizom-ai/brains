/**
 * Resolve a remote flag value into a full MCP endpoint URL.
 *
 * - Bare domain → https://{domain}/mcp
 * - URL without /mcp → append /mcp
 * - Full URL with /mcp → pass through
 */
export function resolveRemoteUrl(remote: string): string {
  let url = remote;

  // Add protocol if missing
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Remove trailing slash
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  // Add /mcp if not present
  if (!url.endsWith("/mcp")) {
    url = `${url}/mcp`;
  }

  return url;
}

/**
 * Resolve auth token from flag or environment variable.
 * Flag takes precedence over BRAIN_REMOTE_TOKEN env var.
 */
export function resolveToken(
  flagToken: string | undefined,
): string | undefined {
  return flagToken ?? process.env["BRAIN_REMOTE_TOKEN"];
}
