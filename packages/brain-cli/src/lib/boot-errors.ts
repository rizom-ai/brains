import { getErrorMessage } from "@brains/utils";

/**
 * Classify boot errors into user-friendly messages.
 */
export function formatBootError(error: unknown): string {
  const msg = getErrorMessage(error);

  // Database lock — another instance running
  if (msg.includes("SQLITE_BUSY") || msg.includes("database is locked")) {
    return `Another brain is running in this directory.\nStop it first, then try again.`;
  }

  // Database errors
  if (msg.includes("SQLITE") || msg.includes("database")) {
    return `Database error: ${msg}\n\nCheck that the data directory is writable and not corrupted.\nTry deleting ./data/ and restarting.`;
  }

  // Missing API key (shouldn't reach here due to preflight, but just in case)
  if (msg.includes("API_KEY") || msg.includes("api key")) {
    return `API key error: ${msg}\n\nSet AI_API_KEY in your .env file.`;
  }

  // Plugin config errors
  if (msg.includes("Plugin") || msg.includes("plugin") || msg.includes("Zod")) {
    return `Plugin configuration error: ${msg}\n\nCheck your brain.yaml plugin overrides.`;
  }

  // Network / port errors
  if (msg.includes("EADDRINUSE")) {
    return `Port already in use. Another brain may be running.\nStop it first or configure a different port in brain.yaml.`;
  }

  if (msg.includes("EACCES")) {
    return `Permission denied: ${msg}\n\nCheck file/directory permissions.`;
  }

  // Git sync errors
  if (msg.includes("git") || msg.includes("GIT_SYNC_TOKEN")) {
    return `Git sync error: ${msg}\n\nCheck GIT_SYNC_TOKEN in .env and the git repo URL in brain.yaml.`;
  }

  // Generic
  return `Boot failed: ${msg}`;
}
