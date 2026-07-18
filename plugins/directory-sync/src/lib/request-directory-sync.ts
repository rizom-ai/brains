import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { BatchResult, IDirectorySync, IGitSync } from "../types";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";

export type DirectorySyncRequestResult =
  | {
      runId?: string | undefined;
      gitPulled: true;
      jobId: string;
      status: "queued";
    }
  | ({
      runId?: string | undefined;
      gitPulled: false;
      status: "queued";
    } & BatchResult)
  | {
      runId?: string | undefined;
      gitPulled: false;
      status: "settled";
    };

export interface RequestDirectorySyncOptions {
  context: ServicePluginContext;
  directorySync: IDirectorySync;
  source: string;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
  toolContext?: ToolContext | undefined;
  gitSync?: IGitSync | undefined;
  operationStatus?: DirectorySyncOperationStatusService | undefined;
}

/** Shared manual sync request path used by tools and the CMS workspace. */
export async function requestDirectorySync(
  options: RequestDirectorySyncOptions,
): Promise<DirectorySyncRequestResult> {
  const runId = await options.operationStatus?.startRun(
    "manual",
    options.gitSync ? "pulling" : "scanning",
  );

  try {
    if (options.gitSync) {
      const jobId = await options.context.jobs.enqueue({
        type: "sync-request",
        data: {
          source: options.source,
          interfaceType: options.interfaceType,
          channelId: options.channelId,
        },
        ...(options.toolContext ? { toolContext: options.toolContext } : {}),
      });
      if (runId) await options.operationStatus?.attachJob(runId, jobId);
      return {
        ...(runId ? { runId } : {}),
        gitPulled: true,
        jobId,
        status: "queued",
      };
    }

    const result = await options.directorySync.queueSyncBatch(
      options.context,
      options.source,
      {
        interfaceType: options.interfaceType,
        channelId: options.channelId,
      },
    );

    if (!result) {
      if (runId) {
        await options.operationStatus?.completeRun(runId, "No files to sync");
      }
      return {
        ...(runId ? { runId } : {}),
        gitPulled: false,
        status: "settled",
      };
    }

    if (runId) {
      await options.operationStatus?.attachBatch(runId, result.batchId);
    }
    return {
      ...(runId ? { runId } : {}),
      ...result,
      gitPulled: false,
      status: "queued",
    };
  } catch (error) {
    if (runId) {
      await options.operationStatus?.failRun(
        runId,
        error instanceof Error ? error.message : "Sync request failed",
        options.gitSync ? "git" : "source",
      );
    }
    throw error;
  }
}
