import {
  createTool,
  type EnqueueJobRequest,
  type Tool,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { seminarRedoFromSchema } from "../handlers/seminar-redo-handler";

export interface SeminarHoldToolDeps {
  /** Only enqueue by job type is used. */
  jobs: { enqueue(request: EnqueueJobRequest): Promise<string> };
}

const seminarHoldInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "For a new seminar: the question to put to every approved peer, as asked",
    ),
  language: z
    .string()
    .trim()
    .min(1)
    .default("English")
    .describe(
      "For a new seminar: the language the peers answer in; their quotes stay as written",
    ),
  seminar: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("To redo a draft seminar instead: its id"),
  from: seminarRedoFromSchema
    .optional()
    .describe(
      "With seminar: where the redo starts. chair-turn keeps the openings and holds the exchange and the closing again; closing keeps every turn and writes the closing again",
    ),
});

/**
 * The owner's tool: queue a seminar on a question, or the redo of a draft
 * from a step of its own. The job asks the peers and writes the seminar; the
 * tool answers at once with the job to watch.
 */
export function createSeminarHoldTool(
  pluginId: string,
  deps: SeminarHoldToolDeps,
): Tool {
  // One attempt: a second would put the turns to the peers again and spend
  // their allowance for this brain twice.
  const once = {
    source: pluginId,
    metadata: { operationType: "data_processing" },
    maxRetries: 0,
  } as const;
  return createTool(
    pluginId,
    "hold",
    "Hold a seminar: put one question to every approved peer at once, let the chair decide whose opening stands, have the others answer him and him answer them, close with where they meet, and keep every peer's turn verbatim, with its sources, as a draft seminar the owner reads and publishes. Or redo a draft seminar from the chair's turn or from the closing; openings are never redone, a new seminar asks them again. Runs as a job that takes a minute or two; returns the job to watch. Each peer's turn is its own model turn.",
    seminarHoldInputSchema,
    async ({ question, language, seminar, from }) => {
      if (
        seminar !== undefined &&
        from !== undefined &&
        question === undefined
      ) {
        const jobId = await deps.jobs.enqueue({
          type: "redo",
          data: { seminar, from },
          options: once,
        });
        return { success: true, data: { jobId, status: "redoing" } };
      }
      if (
        question !== undefined &&
        seminar === undefined &&
        from === undefined
      ) {
        const jobId = await deps.jobs.enqueue({
          type: "hold",
          data: { question, language },
          options: once,
        });
        return { success: true, data: { jobId, status: "holding" } };
      }
      return {
        success: false,
        error:
          "Give a question to hold a new seminar, or a seminar and from to redo a draft; not both.",
      };
    },
    { sideEffects: "external" },
  );
}
