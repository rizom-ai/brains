export function isBusyStatus(status: string): boolean {
  return status === "submitted" || status === "streaming";
}

export function statusPhrase(status: string): string {
  if (status === "submitted") return "the rhizome is listening";
  if (status === "streaming") return "the rhizome is listening";
  if (status === "error") return "a thread broke mid-growth";
  return "";
}

/**
 * Pull the operator-facing line out of a `data-status` stream part, ignoring
 * every other part shape the transport emits.
 */
export function getLiveStatusMessage(part: unknown): string | null {
  if (typeof part !== "object" || part === null) return null;
  if (!("type" in part) || part.type !== "data-status") return null;
  if (!("data" in part)) return null;
  const data = part.data;
  if (typeof data !== "object" || data === null) return null;
  if (!("message" in data) || typeof data.message !== "string") return null;
  return data.message;
}
