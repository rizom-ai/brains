import type { GitSyncStatus } from "../schemas";
import { gitSyncStatusSchema } from "../schemas";

/**
 * Formatter for git sync status
 */
export class GitSyncStatusFormatter {
  format(data: GitSyncStatus): string {
    const status = data;
    const parts: string[] = [];

    // Header
    parts.push("## 🔄 Git Repository Status");

    // Repository check
    if (!status.isRepo) {
      parts.push("\n❌ **Not a git repository**");
      return parts.join("\n");
    }

    // Branch info
    parts.push(`\n**Branch:** \`${status.branch}\``);

    // Clean/dirty status
    const statusIcon = !status.hasChanges ? "✅" : "⚠️";
    const statusText = !status.hasChanges ? "Clean" : "Uncommitted changes";
    parts.push(`\n**Status:** ${statusIcon} ${statusText}`);

    // Sync status
    if (status.ahead > 0 || status.behind > 0) {
      parts.push("\n### Sync Status");
      if (status.ahead > 0) {
        parts.push(
          `- **Ahead:** ${status.ahead} commit${status.ahead !== 1 ? "s" : ""} ↑`,
        );
      }
      if (status.behind > 0) {
        parts.push(
          `- **Behind:** ${status.behind} commit${status.behind !== 1 ? "s" : ""} ↓`,
        );
      }
    } else if (!status.hasChanges) {
      parts.push("\n✅ **Fully synchronized**");
    }

    // Changed files
    if (status.files.length > 0) {
      parts.push("\n### Changed Files");
      parts.push(this.formatFileList(status.files));
    }

    // Last commit
    if (status.lastCommit) {
      parts.push(`\n**Last commit:** \`${status.lastCommit.substring(0, 7)}\``);
    }

    return parts.join("\n");
  }

  canFormat(data: unknown): boolean {
    return gitSyncStatusSchema.safeParse(data).success;
  }

  parse(_content: string): GitSyncStatus {
    // Git sync status is read-only, parsing is not supported
    throw new Error("Git sync status cannot be parsed from markdown");
  }

  private formatFileList(
    files: Array<{ path: string; status: string }>,
  ): string {
    if (files.length > 10) {
      const shown = files.slice(0, 10);
      const remaining = files.length - 10;
      return [
        ...shown.map(
          (f) => `- \`${f.path}\` (${this.getStatusSymbol(f.status)})`,
        ),
        `- ... and ${remaining} more`,
      ].join("\n");
    }
    return files
      .map((f) => `- \`${f.path}\` (${this.getStatusSymbol(f.status)})`)
      .join("\n");
  }

  private getStatusSymbol(status: string): string {
    const statusMap: Record<string, string> = {
      M: "modified",
      A: "added",
      D: "deleted",
      R: "renamed",
      C: "copied",
      U: "updated",
      "?": "untracked",
    };
    return statusMap[status] ?? status;
  }
}
