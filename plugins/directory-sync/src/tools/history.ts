import type { Tool, ToolResult } from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { z } from "@brains/utils";
import type { IGitSync } from "../types";

/**
 * Create the directory-sync_history tool.
 * Only call this when git is configured — the plugin decides whether to register it.
 */
export function createHistoryTool(pluginId: string, gitSync: IGitSync): Tool {
  return createTool(
    pluginId,
    "history",
    "Get version history for an entity from git. Without sha: returns commit list. With sha: returns entity content at that version.",
    z.object({
      entityType: z.string().describe("Entity type (e.g. post, note, link)"),
      id: z.string().describe("Entity ID"),
      sha: z
        .string()
        .optional()
        .describe(
          "Commit SHA to retrieve content at. Omit to list commit history.",
        ),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe("Max commits to return (list mode only)"),
    }),
    async (input): Promise<ToolResult> => {
      const filePath = `${input.entityType}/${input.id}.md`;

      try {
        if (input.sha) {
          // Version mode: get content at specific commit
          const content = await gitSync.show(input.sha, filePath);
          return toolSuccess(
            {
              sha: input.sha,
              entityType: input.entityType,
              id: input.id,
              content,
            },
            `Content at ${input.sha.slice(0, 7)}`,
          );
        }

        // List mode: get commit history
        const commits = await gitSync.log(filePath, input.limit);

        if (commits.length === 0) {
          return toolSuccess(
            { commits: [] },
            `No history found for ${input.entityType}/${input.id}`,
          );
        }

        return toolSuccess(
          { commits, entityType: input.entityType, id: input.id },
          `${commits.length} version${commits.length === 1 ? "" : "s"} found`,
        );
      } catch (error) {
        return toolError(
          error instanceof Error ? error.message : "History lookup failed",
        );
      }
    },
  );
}
