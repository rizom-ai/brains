import type { QueueEntry } from "./queue-manager";
import type { ScheduledJob } from "./scheduler-backend";
import {
  emitPublishExecute,
  executeWithProvider,
  type PublishDeps,
} from "./scheduler-publish";
import type { SchedulerConfig } from "./types/scheduler";

/** Interval for immediate processing (1 second) */
const IMMEDIATE_INTERVAL_MS = 1000;

export interface PublishScheduleRunnerDeps {
  config: SchedulerConfig;
  getPublishDeps: () => PublishDeps;
  isRunning: () => boolean;
}

/**
 * Handles publish queue scheduling and execution.
 * ContentScheduler owns the public API and delegates queue processing here.
 */
export class PublishScheduleRunner {
  private publishJobs: Map<string, ScheduledJob> = new Map();
  private immediateIntervalJob: ScheduledJob | null = null;

  constructor(private readonly deps: PublishScheduleRunnerDeps) {}

  public start(): void {
    for (const [entityType, cronExpr] of Object.entries(this.entitySchedules)) {
      const job = this.deps.config.backend.scheduleCron(cronExpr, () =>
        this.processEntityType(entityType),
      );
      this.publishJobs.set(entityType, job);
    }

    this.immediateIntervalJob = this.deps.config.backend.scheduleInterval(
      IMMEDIATE_INTERVAL_MS,
      () => this.processUnscheduledTypes(),
    );
  }

  public stop(): void {
    stopAndClearJobs(this.publishJobs);

    if (this.immediateIntervalJob) {
      this.immediateIntervalJob.stop();
      this.immediateIntervalJob = null;
    }
  }

  private async processEntityType(entityType: string): Promise<void> {
    if (!this.deps.isRunning()) return;

    try {
      const next = await this.deps.config.queueManager.getNext(entityType);
      if (next) {
        await this.processEntry(next);
      }
    } catch (error) {
      this.deps.config.logger.error(
        `Scheduler error for ${entityType}:`,
        error,
      );
    }
  }

  private async processUnscheduledTypes(): Promise<void> {
    if (!this.deps.isRunning()) return;

    try {
      const queuedTypes =
        await this.deps.config.queueManager.getQueuedEntityTypes();

      for (const entityType of queuedTypes) {
        if (!this.entitySchedules[entityType]) {
          const next = await this.deps.config.queueManager.getNext(entityType);
          if (next) {
            await this.processEntry(next);
            break;
          }
        }
      }
    } catch (error) {
      this.deps.config.logger.error(
        "Scheduler error for unscheduled types:",
        error,
      );
    }
  }

  private async processEntry(entry: QueueEntry): Promise<void> {
    await this.deps.config.queueManager.remove(
      entry.entityType,
      entry.entityId,
    );

    if (this.deps.config.messageBus !== undefined) {
      await emitPublishExecute(entry, this.deps.getPublishDeps());
    } else {
      await executeWithProvider(entry, this.deps.getPublishDeps());
    }
  }

  private get entitySchedules(): Record<string, string> {
    return this.deps.config.entitySchedules as Record<string, string>;
  }
}

function stopAndClearJobs(jobs: Map<string, ScheduledJob>): void {
  for (const job of jobs.values()) {
    job.stop();
  }
  jobs.clear();
}
