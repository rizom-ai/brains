import {
  conversationChangeCursorSchema,
  type ConversationChangeCursor,
  type IConversationService,
} from "@brains/conversation-service";
import type { ProjectionStore } from "@brains/entity-service";
import { BaseJobHandler, type JobsNamespace } from "@brains/job-queue";
import type { IRuntimeStateStore } from "@brains/runtime-state";
import { getErrorMessage } from "@brains/utils/error";
import { createId } from "@brains/utils/id";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";

const BACKFILL_JOB_TYPE = "conversation-projection-backfill";
const CURRENT_RUN_KEY = "current";

const backfillJobSchema = z.strictObject({ runId: z.string().min(1) });

export interface ConversationProjectionBackfillState {
  runId: string;
  status: "active" | "completed" | "failed";
  head: ConversationChangeCursor | null;
  cursor: ConversationChangeCursor | null;
  scanned: number;
  marked: number;
  jobId: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
}

export const conversationProjectionBackfillStateSchema: z.ZodType<ConversationProjectionBackfillState> =
  z.strictObject({
    runId: z.string().min(1),
    status: z.enum(["active", "completed", "failed"]),
    head: conversationChangeCursorSchema.nullable(),
    cursor: conversationChangeCursorSchema.nullable(),
    scanned: z.number().int().nonnegative(),
    marked: z.number().int().nonnegative(),
    jobId: z.string().min(1).nullable(),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
  });

interface BackfillDependencies {
  conversations: Pick<
    IConversationService,
    "getConversationChangeHead" | "listConversationsUpdatedSince"
  >;
  projectionStore: Pick<
    ProjectionStore,
    "getActiveWave" | "listPendingInputs" | "markDirty"
  >;
  state: Pick<
    IRuntimeStateStore<ConversationProjectionBackfillState>,
    "get" | "set"
  >;
  jobs: Pick<JobsNamespace, "enqueue" | "getStatus" | "registerHandler">;
  logger: Logger;
  pageSize?: number | undefined;
  idlePollMs?: number | undefined;
  now?: (() => number) | undefined;
  sleep?:
    ((milliseconds: number, signal: AbortSignal) => Promise<void>) | undefined;
}

function compareCursor(
  left: ConversationChangeCursor,
  right: ConversationChangeCursor,
): number {
  const updated = left.updated.localeCompare(right.updated);
  return updated !== 0 ? updated : left.id.localeCompare(right.id);
}

async function defaultSleep(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Backfill aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export class ConversationProjectionBackfill {
  private readonly dependencies: BackfillDependencies;
  private readonly pageSize: number;
  private readonly idlePollMs: number;
  private readonly now: () => number;
  private readonly sleep: (
    milliseconds: number,
    signal: AbortSignal,
  ) => Promise<void>;

  public constructor(dependencies: BackfillDependencies) {
    this.dependencies = dependencies;
    this.pageSize = dependencies.pageSize ?? 25;
    this.idlePollMs = dependencies.idlePollMs ?? 250;
    this.now = dependencies.now ?? Date.now;
    this.sleep = dependencies.sleep ?? defaultSleep;
  }

  public registerHandler(): void {
    this.dependencies.jobs.registerHandler(
      BACKFILL_JOB_TYPE,
      new ConversationProjectionBackfillJobHandler(
        this,
        this.dependencies.logger.child("ConversationProjectionBackfillJob"),
      ),
    );
  }

  public async resumeActiveRun(): Promise<void> {
    const state = await this.getCurrent();
    if (state?.status !== "active") return;
    await this.ensureJob(state);
  }

  public getCurrent(): Promise<ConversationProjectionBackfillState | null> {
    return this.dependencies.state.get(CURRENT_RUN_KEY);
  }

  public async startNewRun(): Promise<ConversationProjectionBackfillState> {
    const current = await this.getCurrent();
    if (current?.status === "active") {
      await this.ensureJob(current);
      return (await this.getCurrent()) ?? current;
    }

    const timestamp = new Date(this.now()).toISOString();
    const head =
      await this.dependencies.conversations.getConversationChangeHead();
    const state: ConversationProjectionBackfillState = {
      runId: createId(),
      status: head ? "active" : "completed",
      head,
      cursor: null,
      scanned: 0,
      marked: 0,
      jobId: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: head ? null : timestamp,
      error: null,
    };
    await this.dependencies.state.set(CURRENT_RUN_KEY, state);
    if (!head) return state;
    await this.ensureJob(state);
    return (await this.getCurrent()) ?? state;
  }

  public async process(
    runId: string,
    progressReporter: ProgressReporter,
    signal: AbortSignal,
  ): Promise<ConversationProjectionBackfillState> {
    try {
      while (!signal.aborted) {
        const state = await this.getCurrent();
        if (!state) throw new Error(`Backfill run ${runId} no longer exists`);
        if (state.runId !== runId || state.status !== "active") return state;
        const head = state.head;
        if (!head) return await this.complete(state);

        await this.waitForProjectionIdle(signal);
        const conversations =
          await this.dependencies.conversations.listConversationsUpdatedSince({
            after: state.cursor,
            limit: this.pageSize,
          });
        const page = conversations.filter(
          (conversation) =>
            compareCursor(
              { updated: conversation.updated, id: conversation.id },
              head,
            ) <= 0,
        );

        if (page.length === 0) return await this.complete(state);

        for (const conversation of page) {
          await this.dependencies.projectionStore.markDirty({
            sourceType: "conversation",
            sourceId: conversation.id,
            revision: conversation.updated,
            operation: "upsert",
            markedAt: this.now(),
          });
        }

        const last = page.at(-1);
        if (!last) return await this.complete(state);
        const cursor = { updated: last.updated, id: last.id };
        const updated: ConversationProjectionBackfillState = {
          ...state,
          cursor,
          scanned: state.scanned + page.length,
          marked: state.marked + page.length,
          updatedAt: new Date(this.now()).toISOString(),
        };
        await this.dependencies.state.set(CURRENT_RUN_KEY, updated);
        await progressReporter.report({
          progress: compareCursor(cursor, head) >= 0 ? 99 : 50,
          message: `Marked ${updated.marked} conversations for projection`,
        });

        if (
          compareCursor(cursor, head) >= 0 ||
          conversations.length < this.pageSize ||
          page.length < conversations.length
        ) {
          await this.waitForProjectionIdle(signal);
          return await this.complete(updated);
        }
      }
      throw signal.reason ?? new Error("Backfill aborted");
    } catch (error) {
      if (signal.aborted) throw error;
      const current = await this.getCurrent();
      if (current?.runId === runId && current.status === "active") {
        const failed: ConversationProjectionBackfillState = {
          ...current,
          status: "failed",
          updatedAt: new Date(this.now()).toISOString(),
          completedAt: new Date(this.now()).toISOString(),
          error: getErrorMessage(
            error,
            "Conversation projection backfill failed",
          ),
        };
        await this.dependencies.state.set(CURRENT_RUN_KEY, failed);
      }
      throw error;
    }
  }

  private async complete(
    state: ConversationProjectionBackfillState,
  ): Promise<ConversationProjectionBackfillState> {
    const timestamp = new Date(this.now()).toISOString();
    const completed: ConversationProjectionBackfillState = {
      ...state,
      status: "completed",
      updatedAt: timestamp,
      completedAt: timestamp,
      error: null,
    };
    await this.dependencies.state.set(CURRENT_RUN_KEY, completed);
    return completed;
  }

  private async ensureJob(
    state: ConversationProjectionBackfillState,
  ): Promise<void> {
    if (state.jobId) {
      const job = await this.dependencies.jobs.getStatus(state.jobId);
      if (job && (job.status === "pending" || job.status === "processing")) {
        return;
      }
    }
    const jobId = await this.dependencies.jobs.enqueue({
      type: BACKFILL_JOB_TYPE,
      data: { runId: state.runId },
    });
    await this.dependencies.state.set(CURRENT_RUN_KEY, {
      ...state,
      jobId,
      updatedAt: new Date(this.now()).toISOString(),
    });
  }

  private async waitForProjectionIdle(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const [wave, pending] = await Promise.all([
        this.dependencies.projectionStore.getActiveWave(),
        this.dependencies.projectionStore.listPendingInputs(),
      ]);
      if (!wave && pending.length === 0) return;
      await this.sleep(this.idlePollMs, signal);
    }
    throw signal.reason ?? new Error("Backfill aborted");
  }
}

class ConversationProjectionBackfillJobHandler extends BaseJobHandler<
  typeof BACKFILL_JOB_TYPE,
  z.output<typeof backfillJobSchema>,
  ConversationProjectionBackfillState
> {
  public override readonly executionTimeoutMs = 60 * 60 * 1000;
  private readonly backfill: ConversationProjectionBackfill;

  public constructor(backfill: ConversationProjectionBackfill, logger: Logger) {
    super(logger, {
      schema: backfillJobSchema,
      jobTypeName: BACKFILL_JOB_TYPE,
    });
    this.backfill = backfill;
  }

  public override process(
    data: z.output<typeof backfillJobSchema>,
    _jobId: string,
    progressReporter: ProgressReporter,
    signal: AbortSignal,
  ): Promise<ConversationProjectionBackfillState> {
    return this.backfill.process(data.runId, progressReporter, signal);
  }
}
