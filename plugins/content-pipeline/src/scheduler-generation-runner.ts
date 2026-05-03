import type { ScheduledJob } from "./scheduler-backend";
import { triggerGeneration, type GenerationDeps } from "./scheduler-generation";
import type { SchedulerConfig } from "./types/scheduler";

export interface GenerationScheduleRunnerDeps {
  config: SchedulerConfig;
  getGenerationDeps: () => GenerationDeps;
  isRunning: () => boolean;
}

/**
 * Handles scheduled draft generation triggers.
 * ContentScheduler owns the public API and delegates generation jobs here.
 */
export class GenerationScheduleRunner {
  private generationJobs: Map<string, ScheduledJob> = new Map();

  constructor(private readonly deps: GenerationScheduleRunnerDeps) {}

  public start(): void {
    for (const [entityType, cronExpr] of Object.entries(
      this.generationSchedules,
    )) {
      const job = this.deps.config.backend.scheduleCron(cronExpr, () =>
        this.handleTriggerGeneration(entityType),
      );
      this.generationJobs.set(entityType, job);
    }
  }

  public stop(): void {
    stopAndClearJobs(this.generationJobs);
  }

  private async handleTriggerGeneration(entityType: string): Promise<void> {
    if (!this.deps.isRunning()) return;

    try {
      await triggerGeneration(entityType, this.deps.getGenerationDeps());
    } catch (error) {
      this.deps.config.logger.error(
        `Generation trigger error for ${entityType}:`,
        error,
      );
    }
  }

  private get generationSchedules(): Record<string, string> {
    return this.deps.config.generationSchedules as Record<string, string>;
  }
}

function stopAndClearJobs(jobs: Map<string, ScheduledJob>): void {
  for (const job of jobs.values()) {
    job.stop();
  }
  jobs.clear();
}
