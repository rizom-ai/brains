import type { SchemaFormatter } from "@brains/types";
import type { DirectorySyncStatus } from "../types";
import { directorySyncStatusSchema } from "../schemas";

/**
 * Formatter for directory sync status
 */
export class DirectorySyncStatusFormatter
  implements SchemaFormatter<DirectorySyncStatus>
{
  canFormat(data: unknown): boolean {
    return directorySyncStatusSchema.safeParse(data).success;
  }

  format(data: DirectorySyncStatus): string {
    const lines: string[] = [];

    // Header
    lines.push("# Directory Sync Status\n");

    // Basic info
    lines.push(`**Sync Path:** ${data.syncPath}`);
    lines.push(`**Directory Exists:** ${data.exists ? "✅ Yes" : "❌ No"}`);
    lines.push(
      `**File Watching:** ${data.watching ? "✅ Active" : "⏸️  Inactive"}`,
    );

    if (data.lastSync) {
      lines.push(`**Last Sync:** ${data.lastSync.toLocaleString()}`);
    }

    lines.push("");

    // Statistics
    lines.push("## Statistics\n");
    lines.push(`**Total Files:** ${data.stats.totalFiles}`);

    if (Object.keys(data.stats.byEntityType).length > 0) {
      lines.push("\n### Files by Entity Type\n");
      for (const [entityType, count] of Object.entries(
        data.stats.byEntityType,
      )) {
        lines.push(`- **${entityType}:** ${count} files`);
      }
    }

    // Recent files
    if (data.files.length > 0) {
      lines.push("\n## Recent Files\n");

      // Sort by modified date, most recent first
      const recentFiles = [...data.files]
        .sort((a, b) => b.modified.getTime() - a.modified.getTime())
        .slice(0, 10);

      for (const file of recentFiles) {
        const modified = file.modified.toLocaleString();
        lines.push(
          `- \`${file.path}\` (${file.entityType}) - Modified: ${modified}`,
        );
      }

      if (data.files.length > 10) {
        lines.push(`\n*...and ${data.files.length - 10} more files*`);
      }
    }

    // Directory structure hint
    if (data.exists && data.stats.totalFiles === 0) {
      lines.push("\n## Getting Started\n");
      lines.push(
        "Your sync directory is empty. Entities will be organized as follows:",
      );
      lines.push("- Base entities: `/<entity-id>.md`");
      lines.push("- Other types: `/<entity-type>/<entity-id>.md`");
    }

    return lines.join("\n");
  }
}
