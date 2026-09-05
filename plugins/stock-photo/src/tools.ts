import { defineTool, z } from "@brains/sdk/services";
import type {
  AnyServiceToolDefinition,
  ServiceJobReference,
} from "@brains/sdk/services";
import { searchResultSchema, type StockPhotoProvider } from "./lib/types";
import { selectPhotoInputSchema, selectPhotoJob } from "./select-photo-job";

const searchInputSchema = z.object({
  query: z.string().describe("Search terms for stock photos"),
  perPage: z
    .number()
    .min(1)
    .max(30)
    .default(10)
    .describe("Results per page (1-30)"),
  page: z.number().min(1).default(1).describe("Page number"),
});

/** The queue as the select tool sees it: it enqueues, and nothing else. */
export interface SelectQueue {
  enqueue(
    definition: typeof selectPhotoJob,
    input: z.input<typeof selectPhotoInputSchema>,
  ): Promise<ServiceJobReference<typeof selectPhotoJob>>;
}

export function searchTool(
  provider: StockPhotoProvider,
): AnyServiceToolDefinition {
  return defineTool({
    name: "search",
    description:
      "Search for stock photos. Returns photo candidates with preview URLs and metadata. Use stock-photo_select to materialize a chosen photo into an image entity.",
    input: searchInputSchema,
    output: searchResultSchema,
    sideEffects: "none",
    execute: ({ input }) =>
      provider.searchPhotos(input.query, {
        page: input.page,
        perPage: input.perPage,
      }),
  });
}

/**
 * Selecting answers at once with the credit to show and the job that does the
 * work; the download and the write happen on the queue, not in the tool call.
 */
export function selectTool(jobs: SelectQueue): AnyServiceToolDefinition {
  return defineTool({
    name: "select",
    description:
      "Select a stock photo from search results and materialize it as an image entity. Triggers provider download tracking per ToS. Optionally sets it as the cover image of a target entity.",
    input: selectPhotoInputSchema,
    output: z.object({
      attribution: z.object({
        photographerName: z.string(),
        photographerUrl: z.string(),
        sourceUrl: z.string(),
      }),
      jobId: z.string(),
      status: z.literal("generating"),
    }),
    sideEffects: "external",
    execute: async ({ input }) => {
      const job = await jobs.enqueue(selectPhotoJob, input);
      return {
        attribution: {
          photographerName: input.photographerName,
          photographerUrl: input.photographerUrl,
          sourceUrl: input.sourceUrl,
        },
        jobId: job.id,
        status: "generating" as const,
      };
    },
  });
}
