import { readingDigest } from "@fixture/reading-entities";
import {
  contentGenerationResultSchema,
  defineJob,
  defineServicePlugin,
  defineTool,
  z,
  type ServiceContentGeneration,
  type ServiceContentGenerationContext,
  type ServiceContentGenerationItem,
  type ServiceContentGenerationResult,
  type ServiceContentGenerationSkipReason,
  type ServiceContentGenerationTarget,
  type ServiceContentGenerationTargetInput,
  type ServiceEntityIdPath,
  type ServiceJobDefinition,
  type ServiceJobReference,
  type ServicePackageDefinition,
  type ServiceTemplateGenerationDefinition,
} from "@rizom/brain/services";

// Included by the standalone and packed typechecks, not loaded by a brain.

const digestJob: ServiceJobDefinition<
  "digest",
  z.ZodObject<{ id: z.ZodString }>,
  z.ZodObject<{ words: z.ZodNumber }>
> = defineJob({
  name: "digest",
  input: z.object({ id: z.string() }),
  output: z.object({ words: z.number() }),
});

const digestPrompt: ServiceTemplateGenerationDefinition = {
  prompt: "Summarize the reading in one paragraph.",
};

/** The generation a tool admits, written outside the tool that is handed it. */
function planDigest(
  content: ServiceContentGeneration<"written">,
  id: string,
): ServiceContentGenerationTarget {
  const idPath: ServiceEntityIdPath = [id, "written"];
  const context: ServiceContentGenerationContext = { data: { id } };
  const input: ServiceContentGenerationTargetInput<
    typeof readingDigest,
    "written"
  > = {
    template: "written",
    context,
    destination: {
      entity: readingDigest,
      idPath,
      metadata: { bookmarkId: id, title: "Written digest", wordCount: 0 },
    },
  };
  return content.target(input);
}

/** What an admission reports for each target, read by its public types. */
function describe(result: ServiceContentGenerationResult): string[] {
  return result.items.map((item: ServiceContentGenerationItem) => {
    if (item.status !== "skipped") return item.status;
    const reason: ServiceContentGenerationSkipReason = item.reason;
    return `skipped: ${reason}`;
  });
}

export const contractTypeCanary: ServicePackageDefinition<
  z.ZodObject<Record<string, never>>
> = defineServicePlugin(
  { id: "contract-canary", config: z.object({}) },
  {
    templates: {
      written: {
        schema: z.object({ summary: z.string() }),
        generation: digestPrompt,
        format: ({ value }) => value.summary,
      },
    },
    jobs: () => [digestJob.handle(async () => ({ words: 0 }))],
    tools: ({ content, jobs }) => [
      defineTool({
        name: "write",
        description: "Write a digest and queue its count",
        input: z.object({ id: z.string() }),
        output: contentGenerationResultSchema,
        sideEffects: "writes",
        execute: async ({ input }) => {
          const queued: ServiceJobReference<typeof digestJob> =
            await jobs.enqueue(digestJob, { id: input.id });
          void queued.status();
          const result = await content.generate({
            targets: [planDigest(content, input.id)],
          });
          void describe(result);
          return result;
        },
      }),
    ],
  },
);
