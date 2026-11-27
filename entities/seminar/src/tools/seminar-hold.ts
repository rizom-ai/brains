import {
  createTool,
  type EnqueueJobRequest,
  type Tool,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";

export interface SeminarHoldToolDeps {
  /** Only enqueue by job type is used. */
  jobs: { enqueue(request: EnqueueJobRequest): Promise<string> };
}

const seminarHoldInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .describe("The question to put to every approved peer, as asked"),
  language: z
    .string()
    .trim()
    .min(1)
    .default("English")
    .describe("The language the peers answer in; their quotes stay as written"),
});

/**
 * The owner's tool: queue a seminar on a question. The job asks the peers
 * and writes the seminar; the tool answers at once with the job to watch.
 */
export function createSeminarHoldTool(
  pluginId: string,
  deps: SeminarHoldToolDeps,
): Tool {
  return createTool(
    pluginId,
    "hold",
    "Hold a seminar: put one question to every approved peer at once and keep each peer's answer verbatim, with its sources, as a draft seminar the owner reads and publishes. Runs as a job that takes a minute or two; returns the job to watch. Each peer answers with its own model turn.",
    seminarHoldInputSchema,
    async ({ question, language }) => {
      const jobId = await deps.jobs.enqueue({
        type: "hold",
        data: { question, language },
        // One attempt: a second would put the question to every peer again
        // and spend their allowance for this brain twice.
        options: {
          source: pluginId,
          metadata: { operationType: "data_processing" },
          maxRetries: 0,
        },
      });
      return { success: true, data: { jobId, status: "holding" } };
    },
    { sideEffects: "external" },
  );
}
