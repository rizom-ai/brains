import type { DirectorySyncHost } from "../host";
import { syncRequestJob } from "../jobs";
import type { BatchResult, IDirectorySync, IGitSync } from "../types";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import { getErrorMessage } from "@brains/utils/error";

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
  host: Pick<DirectorySyncHost, "jobs" | "mirror">;
  directorySync: IDirectorySync;
  source: string;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
  gitSync?: IGitSync | undefined;
  operationStatus?: DirectorySyncOperationStatusService | undefined;
}

/**
 * Shared manual sync request path used by the tool and the Studio workspace.
 * Who asked is on the job: the runtime records the caller of the tool or
 * action that enqueued it.
 */
export async function requestDirectorySync(
  options: RequestDirectorySyncOptions,
): Promise<DirectorySyncRequestResult> {
  const runId = await options.operationStatus?.startRun(
    "manual",
    options.gitSync ? "pulling" : "scanning",
  );

  try {
    if (options.gitSync) {
      const job = await options.host.jobs.enqueue(syncRequestJob, {
        source: options.source,
        runId,
        interfaceType: options.interfaceType,
        channelId: options.channelId,
      });
      if (runId) await options.operationStatus?.attachJob(runId, job.id);
      return {
        ...(runId ? { runId } : {}),
        gitPulled: true,
        jobId: job.id,
        status: "queued",
      };
    }

    const result = await options.directorySync.queueSyncBatch(
      options.host,
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
        getErrorMessage(error, "Sync request failed"),
        options.gitSync ? "git" : "source",
      );
    }
    throw error;
  }
}
