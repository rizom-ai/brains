import type { LocalDatabaseRpcClient } from "@brains/core";
import {
  ENTITY_RPC_SERVICE,
  parseEntityRpcResult,
} from "@brains/entity-service";
import {
  JOB_QUEUE_RPC_SERVICE,
  parseJobQueueRpcResult,
  type JobInfo,
} from "@brains/job-queue";
import { isRecord } from "@brains/utils/is-record";

export interface ImportBurstJobSnapshot {
  jobIds: string[];
  itemCount: number;
}

/** Read-only observer of an existing owner. Never opens a database or owns its lifetime. */
export class ImportBurstOwnerProbe {
  private readonly client: Pick<LocalDatabaseRpcClient, "request">;

  public constructor(client: Pick<LocalDatabaseRpcClient, "request">) {
    this.client = client;
  }

  public async countNotes(marker?: string): Promise<number> {
    return parseEntityRpcResult(
      { operation: "countEntities" },
      await this.client.request(ENTITY_RPC_SERVICE, {
        operation: "countEntities",
        request: {
          entityType: "note",
          options: {
            filter: { visibilityScope: "restricted", contentContains: marker },
          },
        },
      }),
    );
  }

  public async countProbeNotesWithMarker(marker: string): Promise<number> {
    const matchingIds = new Set<string>();
    // One full-text row per response stays bounded. Deduplicate across pages:
    // concurrent imports can move a newly matching ID ahead of the offset.
    const rowLimit = await this.countNotes(marker);
    for (let offset = 0; offset < rowLimit; offset++) {
      const page = parseEntityRpcResult(
        { operation: "listEntities" },
        await this.client.request(ENTITY_RPC_SERVICE, {
          operation: "listEntities",
          request: {
            entityType: "note",
            options: {
              limit: 1,
              offset,
              sortFields: [{ field: "id", direction: "asc" }],
              filter: {
                contentContains: marker,
                visibilityScope: "restricted",
              },
            },
          },
        }),
      );
      if (page.length === 0) return matchingIds.size;
      for (const entity of page) {
        if (
          entity.id.toLowerCase().startsWith("directory-sync-stress-") &&
          entity.content.includes(marker)
        )
          matchingIds.add(entity.id);
      }
    }
    return matchingIds.size;
  }

  private async activeImports(): Promise<JobInfo[]> {
    return parseJobQueueRpcResult(
      { operation: "getActiveJobs" },
      await this.client.request(JOB_QUEUE_RPC_SERVICE, {
        operation: "getActiveJobs",
        types: ["directory-sync:directory-import"],
      }),
    );
  }

  public async hasActiveImports(): Promise<boolean> {
    return (await this.activeImports()).length > 0;
  }

  public async readHeldImports(): Promise<ImportBurstJobSnapshot> {
    const jobs = (await this.activeImports())
      .filter((job) => job.status === "pending")
      .sort(
        (a, b) =>
          a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    return {
      jobIds: jobs.map(({ id }) => id),
      itemCount: jobs.reduce((total, job) => {
        const data: unknown = JSON.parse(job.data);
        return (
          total +
          (isRecord(data) && Array.isArray(data["paths"])
            ? data["paths"].length
            : 0)
        );
      }, 0),
    };
  }

  public async readQueuedDeletes(
    createdAfter: number,
  ): Promise<ImportBurstJobSnapshot> {
    const matching = new Map<string, JobInfo>();
    // Fresh pending jobs have no runtime-update cursor. Read the type-filtered
    // active set as well; oversized results must still fail the owner's limits.
    const active = parseJobQueueRpcResult(
      { operation: "getActiveJobs" },
      await this.client.request(JOB_QUEUE_RPC_SERVICE, {
        operation: "getActiveJobs",
        types: ["directory-sync:directory-delete"],
      }),
    );
    for (const job of active)
      if (job.createdAt >= createdAfter) matching.set(job.id, job);
    let cursor = { updatedAt: 0, jobId: "" };
    // Bound row visits by the initial durable count, not wall time: runtime
    // cursors are logical timestamps and may run ahead of Date.now(). Concurrent
    // changes can require another convergence poll; this is not a SQL snapshot.
    let remaining = parseJobQueueRpcResult(
      { operation: "getStats" },
      await this.client.request(JOB_QUEUE_RPC_SERVICE, {
        operation: "getStats",
      }),
    ).total;
    while (remaining > 0) {
      const page = parseJobQueueRpcResult(
        { operation: "getRuntimeUpdates" },
        await this.client.request(JOB_QUEUE_RPC_SERVICE, {
          operation: "getRuntimeUpdates",
          cursor,
          limit: Math.min(32, remaining),
        }),
      );
      remaining -= page.length;
      for (const { job } of page) {
        if (
          job.type === "directory-sync:directory-delete" &&
          job.createdAt >= createdAfter
        )
          matching.set(job.id, job);
      }
      const last = page.at(-1);
      if (!last) return this.deleteSnapshot(matching);
      cursor = last.cursor;
    }
    return this.deleteSnapshot(matching);
  }

  public async countTerminalJobs(jobIds: string[]): Promise<number> {
    let count = 0;
    // Sequential requests preserve the observer's bounded admission footprint.
    for (const jobId of jobIds) {
      const job = parseJobQueueRpcResult(
        { operation: "getStatus" },
        await this.client.request(JOB_QUEUE_RPC_SERVICE, {
          operation: "getStatus",
          jobId,
        }),
      );
      if (job?.status === "completed" || job?.status === "failed") count++;
    }
    return count;
  }

  private deleteSnapshot(
    jobs: ReadonlyMap<string, JobInfo>,
  ): ImportBurstJobSnapshot {
    const ordered = [...jobs.values()].sort(
      (a, b) =>
        a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return {
      jobIds: ordered.map(({ id }) => id),
      itemCount: ordered.reduce((total, job) => {
        const data: unknown = JSON.parse(job.data);
        return (
          total +
          (isRecord(data) && Array.isArray(data["deletions"])
            ? data["deletions"].length
            : 1)
        );
      }, 0),
    };
  }
}
