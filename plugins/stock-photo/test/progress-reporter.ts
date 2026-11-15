import {
  CallbackProgressReporter,
  type ProgressReporter,
} from "@brains/utils/progress";

export function createProgressReporter(): ProgressReporter {
  const reporter = CallbackProgressReporter.from(async () => {});
  if (!reporter) throw new Error("Failed to create progress reporter");
  return reporter;
}
