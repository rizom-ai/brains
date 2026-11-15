import type { ProgressReporter } from "@brains/utils/progress";

/** One step of a job's progress: how far, of how much, and what it is doing. */
export interface ProgressStep {
  progress: number;
  total?: number;
  message: string;
}

/** Report a job's progress, out of 100 unless the step says otherwise. */
export async function reportProgress(
  reporter: ProgressReporter,
  step: ProgressStep,
): Promise<void> {
  await reporter.report({
    progress: step.progress,
    total: step.total ?? 100,
    message: step.message,
  });
}
