import type {
  Tool,
  ToolResult,
  ServicePluginContext,
  ToolContext,
} from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { IDirectorySync, IGitSync } from "../types";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
import { requestDirectorySync } from "../lib/request-directory-sync";
import { handleHistory } from "./history";

const directorySyncInputSchema = z.object({
  action: z
    .enum(["sync", "status"])
    .default("sync")
    .describe("Use sync for a refresh request and status for a status check"),
});

const gitDirectorySyncInputSchema = z.object({
  action: z
    .enum(["sync", "status", "history"])
    .default("sync")
    .describe(
      "Use sync for git/filesystem sync, status for a status check, and history only for entity history",
    ),
  entityType: z
    .string()
    .optional()
    .describe("History only; omit for sync and status"),
  id: z.string().optional().describe("History only; omit for sync and status"),
  sha: z
    .string()
    .optional()
    .describe("Optional history revision; omit for sync and status"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe("History only; omit for sync and status"),
});

const directorySyncActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("status") }),
]);

const gitDirectorySyncActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("status") }),
  z.object({
    action: z.literal("history"),
    entityType: z.string().min(1),
    id: z.string().min(1),
    sha: z.string().optional(),
    limit: z.number().int().positive().optional().default(10),
  }),
]);

export function createDirectorySyncTools(
  directorySync: IDirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
  gitSync?: IGitSync,
  operationStatus?: DirectorySyncOperationStatusService,
): Tool[] {
  const directoryTool = createTool(
    "directory",
    "sync",
    gitSync
      ? "Manage directory and git sync with an action discriminator. For requests such as 'sync with git', immediately call action=sync with no entityType, id, or sha; never ask for those fields because they apply only to action=history. Action=sync queues a git pull plus filesystem scan when git is configured and also handles refresh, pull, backup-to-git, and filesystem import requests. For every sync or git status follow-up after action=sync, including a bare 'what is the status', immediately call action=status with no entity fields; a sync jobId is not a system_job_status batchId. Use action=history to read git version history for a specific entity."
      : "Manage directory sync with an action discriminator. Immediately call action=sync for refresh, filesystem import, or content sync requests. Immediately call action=status for directory sync status follow-ups, including a bare 'what is the status'.",
    gitSync ? gitDirectorySyncInputSchema : directorySyncInputSchema,
    async (input, context) => {
      const parsed = gitSync
        ? gitDirectorySyncActionSchema.parse(input)
        : directorySyncActionSchema.parse(input);

      if (parsed.action === "sync") {
        return handleSync({
          directorySync,
          pluginContext,
          pluginId,
          gitSync,
          operationStatus,
          context,
        });
      }

      if (parsed.action === "status") {
        return handleStatus(directorySync, gitSync);
      }

      if (!gitSync) {
        return toolError(
          "History is unavailable because git is not configured",
        );
      }

      return handleHistory(parsed, gitSync);
    },
    {
      visibility: "admin",
      sideEffects: "external",
      cli: { name: "sync" },
    },
  );

  return [directoryTool];
}

async function handleSync(input: {
  directorySync: IDirectorySync;
  pluginContext: ServicePluginContext;
  pluginId: string;
  gitSync?: IGitSync | undefined;
  operationStatus?: DirectorySyncOperationStatusService | undefined;
  context: ToolContext;
}): Promise<ToolResult> {
  try {
    const source = input.context.channelId
      ? `${input.context.interfaceType}:${input.context.channelId}`
      : `plugin:${input.pluginId}`;

    const result = await requestDirectorySync({
      context: input.pluginContext,
      directorySync: input.directorySync,
      source,
      interfaceType: input.context.interfaceType,
      channelId: input.context.channelId,
      toolContext: input.context,
      gitSync: input.gitSync,
      operationStatus: input.operationStatus,
    });

    if (result.gitPulled) {
      return toolSuccess(
        {
          jobId: result.jobId,
          status: result.status,
          gitPulled: true,
          ...(result.runId ? { runId: result.runId } : {}),
        },
        "Sync queued: git pull and filesystem scan will run in the background",
      );
    }

    if (result.status === "settled") {
      return toolSuccess(
        {
          gitPulled: false,
          ...(result.runId ? { runId: result.runId } : {}),
        },
        "No files to sync",
      );
    }

    return toolSuccess(
      {
        batchId: result.batchId,
        importOperations: result.importOperationsCount,
        totalFiles: result.totalFiles,
        gitPulled: false,
        ...(result.runId ? { runId: result.runId } : {}),
      },
      `Sync started: ${result.importOperationsCount} import jobs queued for ${result.totalFiles} files`,
    );
  } catch (error) {
    return toolError(getErrorMessage(error, "Sync failed"));
  }
}

async function handleStatus(
  directorySync: IDirectorySync,
  gitSync?: IGitSync,
): Promise<ToolResult> {
  try {
    const syncStatus = await directorySync.getStatus();

    const data: Record<string, unknown> = {
      syncPath: syncStatus.syncPath,
      lastSync: syncStatus.lastSync?.toISOString(),
      watching: syncStatus.watching,
    };

    if (gitSync) {
      const gitStatus = await gitSync.getStatus();
      data["git"] = {
        isRepo: gitStatus.isRepo,
        branch: gitStatus.branch,
        hasChanges: gitStatus.hasChanges,
        ahead: gitStatus.ahead,
        behind: gitStatus.behind,
        remote: gitStatus.remote,
      };
    }

    return toolSuccess(data);
  } catch (error) {
    return toolError(getErrorMessage(error, "Status check failed"));
  }
}
