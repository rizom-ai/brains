import { ApiError } from "./api";
import { errorMessage } from "./ui-utils";

/** Read-only recovery guidance: never reload a draft or replay a mutation. */
export function readErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Your session is no longer authenticated. Sign in again in another tab, then retry here. Keep this tab open to preserve your draft.";
      case 403:
        return "You do not currently have permission to read this content. Ask an administrator to check access, then retry.";
      case 404:
        return "This content is unavailable. It may have moved, been removed, or be outside your access. Choose another destination or retry.";
      case 429:
        return "Studio is receiving too many requests. Wait briefly before retrying.";
    }
  }
  return `Studio could not load this data. Check your connection or retry later. ${errorMessage(error)}`;
}
