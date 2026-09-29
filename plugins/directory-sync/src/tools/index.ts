import {
  defineTool,
  type AnyServiceToolDefinition,
  type ToolContext,
} from "@brains/sdk/services";
import { z } from "@brains/utils/zod";
import type { DirectorySyncHost } from "../host";
import type { IDirectorySync, IGitSync } from "../types";
import { gitLogEntrySchema } from "../types/results";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
import { requestDirectorySync } from "../lib/request-directory-sync";
import { handleHistory, type HistoryOutcome } from "./history";

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

/** What a sync request answers: queued work, or nothing to do. */
const syncOutcomeSchema = z.object({
  gitPulled: z.boolean(),
  status: z.enum(["queued", "settled"]),
  runId: z.string().optional(),
  jobId: z.string().optional(),
  batchId: z.string().optional(),
  importOperations: z.number().int().nonnegative().optional(),
  totalFiles: z.number().int().nonnegative().optional(),
  message: z.string(),
});
type SyncOutcome = z.output<typeof syncOutcomeSchema>;

const statusOutcomeSchema = z.object({
  syncPath: z.string(),
  lastSync: z.string().optional(),
  watching: z.boolean(),
  git: z
    .object({
      isRepo: z.boolean(),
      branch: z.string(),
      hasChanges: z.boolean(),
      ahead: z.number(),
      behind: z.number(),
      remote: z.string().optional(),
    })
    .optional(),
});
type StatusOutcome = z.output<typeof statusOutcomeSchema>;

const historyOutcomeSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  sha: z.string().optional(),
  content: z.string().optional(),
  commits: z.array(gitLogEntrySchema).optional(),
  message: z.string(),
});

const directorySyncToolOutputSchema = z.union([
  syncOutcomeSchema,
  statusOutcomeSchema,
  historyOutcomeSchema,
]);

const GIT_DESCRIPTION =
  "Manage directory and git sync with an action discriminator. For requests such as 'sync with git', immediately call action=sync with no entityType, id, or sha; never ask for those fields because they apply only to action=history. Action=sync queues a git pull plus filesystem scan when git is configured and also handles refresh, pull, backup-to-git, and filesystem import requests. For every sync or git status follow-up after action=sync, including a bare 'what is the status', immediately call action=status with no entity fields; a sync jobId is not a system_job_status batchId. Use action=history to read git version history for a specific entity.";
const PLAIN_DESCRIPTION =
  "Manage directory sync with an action discriminator. Immediately call action=sync for refresh, filesystem import, or content sync requests. Immediately call action=status for directory sync status follow-ups, including a bare 'what is the status'.";

export interface DirectorySyncToolOptions {
  readonly directorySync: IDirectorySync;
  readonly host: Pick<DirectorySyncHost, "jobs" | "mirror">;
  readonly gitSync?: IGitSync | undefined;
  readonly operationStatus?: DirectorySyncOperationStatusService | undefined;
}

/**
 * The one tool directory-sync declares: sync, status, and — with git — the
 * history of one entity. Who asked is on the caller the runtime resolved;
 * the job that runs for them is filed with that caller recorded.
 */
export function createDirectorySyncTools(
  options: DirectorySyncToolOptions,
): readonly AnyServiceToolDefinition[] {
  const { directorySync, host, gitSync, operationStatus } = options;

  const sync = async (
    caller: ToolContext | undefined,
  ): Promise<SyncOutcome> => {
    const source = caller?.channelId
      ? `${caller.interfaceType}:${caller.channelId}`
      : "plugin:directory-sync";
    const result = await requestDirectorySync({
      host,
      directorySync,
      source,
      interfaceType: caller?.interfaceType,
      channelId: caller?.channelId,
      gitSync,
      operationStatus,
    });
    if (result.gitPulled) {
      return {
        gitPulled: true,
        status: result.status,
        jobId: result.jobId,
        ...(result.runId ? { runId: result.runId } : {}),
        message:
          "Sync queued: git pull and filesystem scan will run in the background",
      };
    }
    if (result.status === "settled") {
      return {
        gitPulled: false,
        status: "settled",
        ...(result.runId ? { runId: result.runId } : {}),
        message: "No files to sync",
      };
    }
    return {
      gitPulled: false,
      status: "queued",
      batchId: result.batchId,
      importOperations: result.importOperationsCount,
      totalFiles: result.totalFiles,
      ...(result.runId ? { runId: result.runId } : {}),
      message: `Sync started: ${result.importOperationsCount} import jobs queued for ${result.totalFiles} files`,
    };
  };

  const status = async (): Promise<StatusOutcome> => {
    const syncStatus = await directorySync.getStatus();
    const outcome: StatusOutcome = {
      syncPath: syncStatus.syncPath,
      ...(syncStatus.lastSync
        ? { lastSync: syncStatus.lastSync.toISOString() }
        : {}),
      watching: syncStatus.watching,
    };
    if (!gitSync) return outcome;
    const gitStatus = await gitSync.getStatus();
    return {
      ...outcome,
      git: {
        isRepo: gitStatus.isRepo,
        branch: gitStatus.branch,
        hasChanges: gitStatus.hasChanges,
        ahead: gitStatus.ahead,
        behind: gitStatus.behind,
        ...(gitStatus.remote ? { remote: gitStatus.remote } : {}),
      },
    };
  };

  if (gitSync) {
    return [
      defineTool({
        name: "sync",
        description: GIT_DESCRIPTION,
        input: gitDirectorySyncInputSchema,
        output: directorySyncToolOutputSchema,
        permission: "admin",
        sideEffects: "external",
        execute: async ({
          input,
          caller,
        }): Promise<SyncOutcome | StatusOutcome | HistoryOutcome> => {
          const parsed = gitDirectorySyncActionSchema.parse(input);
          if (parsed.action === "sync") return sync(caller);
          if (parsed.action === "status") return status();
          return handleHistory(parsed, gitSync);
        },
      }),
    ];
  }

  return [
    defineTool({
      name: "sync",
      description: PLAIN_DESCRIPTION,
      input: directorySyncInputSchema,
      output: directorySyncToolOutputSchema,
      permission: "admin",
      sideEffects: "external",
      execute: async ({
        input,
        caller,
      }): Promise<SyncOutcome | StatusOutcome> => {
        const parsed = directorySyncActionSchema.parse(input);
        return parsed.action === "sync" ? sync(caller) : status();
      },
    }),
  ];
}
