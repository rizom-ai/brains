import { bookmark, readingDigest } from "@fixture/reading-entities";
import {
  contentGenerationResultSchema,
  defineJob,
  defineServicePlugin,
  defineTool,
  z,
} from "@rizom/brain/services";

// Shared schemas drive tool input, job input/output, and persisted result checks.
const digestRequest = z.object({
  bookmarkId: z.string(),
});

const digestResult = z.object({
  bookmarkId: z.string(),
  summary: z.string(),
  wordCount: z.number().int().nonnegative(),
});

const digestStatus = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z
    .object({
      progress: z.number(),
      total: z.number().optional(),
      message: z.string().optional(),
    })
    .nullable(),
  result: digestResult.optional(),
  error: z.string().optional(),
});

// Export the reusable job contract; execution is bound by the owning service.
export const compileReadingDigest = defineJob({
  name: "compile-reading-digest",
  input: digestRequest,
  output: digestResult,
  retry: { attempts: 2 },
  deadline: "30s",
});

const readbackInput = z.object({
  digestId: z.string(),
  overviewId: z.string(),
});
const readbackResult = z.object({
  digest: z.object({ content: z.string(), bookmarkId: z.string() }),
  overview: z.object({ content: z.string(), url: z.string() }),
});
const readGeneratedOutputs = defineJob({
  name: "read-generated-outputs",
  input: readbackInput,
  output: readbackResult,
});

export default defineServicePlugin({
  id: "reading-insights",
  config: z.object({
    summaryPrefix: z.string().default("Reading digest"),
  }),

  // Setup returns inferred state shared by the service callbacks.
  setup({ config }) {
    return {
      summarize(
        bookmarkId: string,
        title: string,
        content: string,
      ): z.output<typeof digestResult> {
        const wordCount = content.split(/\s+/u).filter(Boolean).length;
        return {
          bookmarkId,
          summary: `${config.summaryPrefix}: ${title} (${wordCount} words)`,
          wordCount,
        };
      },
    };
  },

  instructions: ({ config }) =>
    `Offer to compile a digest when a reader saves a long page. Prefix digests with "${config.summaryPrefix}".`,

  resources: ({ config }) => ({
    guide: {
      uri: "reading://guide",
      description: "How reading digests are produced.",
      read: (): string =>
        `Digests are deterministic and use the prefix "${config.summaryPrefix}".`,
    },
  }),

  prompts: {
    digest: {
      description: "Explain an existing reading digest.",
      input: digestResult,
      render: ({ input }) =>
        `Explain this digest in one sentence: ${input.summary}`,
    },
  },

  // Templates validate render data before producing text.
  templates: {
    digest: {
      schema: digestResult,
      format: ({ value }) =>
        `# ${value.summary}\n\nSource bookmark: ${value.bookmarkId}`,
    },
    generatedBookmark: {
      schema: z.object({ title: z.string(), body: z.string() }),
      generation: {
        prompt: "Write a reading overview for the supplied bookmark.",
      },
      format: ({ value }) => `# ${value.title}\n\n${value.body}`,
    },
    generatedDigest: {
      schema: digestResult,
      generation: {
        prompt: "Write a concise digest of the requested bookmark.",
        useKnowledgeContext: true,
      },
      format: ({ value }) =>
        `# ${value.summary}\n\nSource bookmark: ${value.bookmarkId}`,
    },
  },

  // A same-name view reuses the exact schema object and adds web rendering.
  // Views are React components, the same authoring dialect as site sections.
  views: {
    digest: {
      schema: digestResult,
      description: "A compact reading-digest result.",
      renderers: {
        web: ({ summary, wordCount }) => (
          <article>
            <strong>{summary}</strong>
            <small>{wordCount} words</small>
          </article>
        ),
      },
    },
  },

  // Binding with .handle() keeps the contract importable without its executor.
  jobs: ({ state }) => [
    readGeneratedOutputs.handle(async ({ input, entities }) => {
      const digest = await entities.get(readingDigest, input.digestId);
      const overview = await entities.get(bookmark, input.overviewId);
      if (!digest || !overview)
        throw new Error("Generated outputs are missing");
      return {
        digest: {
          content: digest.content,
          bookmarkId: digest.metadata.bookmarkId,
        },
        overview: { content: overview.content, url: overview.metadata.url },
      };
    }),
    compileReadingDigest.handle(
      async ({ input, entities, messaging, progress, signal, templates }) => {
        signal.throwIfAborted();
        await progress.report({
          progress: 25,
          total: 100,
          message: "Loading bookmark",
        });

        const saved = await entities.get(bookmark, input.bookmarkId);
        if (!saved) {
          throw new Error(`Bookmark not found: ${input.bookmarkId}`);
        }

        const result = state.summarize(
          saved.id,
          saved.metadata.title,
          saved.content,
        );

        await progress.report({
          progress: 100,
          total: 100,
          message: "Digest ready",
        });
        // Entity data reaches the template only through the declared render schema.
        await messaging.publish({
          topic: "digest-ready",
          data: { ...result, markdown: templates.format("digest", result) },
        });
        return result;
      },
    ),
  ],

  // Tools return plain schema-valid data; durable mechanics stay framework-owned.
  tools: ({ content, jobs }) => [
    defineTool({
      name: "read-generated-outputs",
      description: "Read generated entities through typed readers",
      input: readbackInput,
      output: z.object({ jobId: z.string() }),
      sideEffects: "writes",
      async execute({ input }) {
        const job = await jobs.enqueue(readGeneratedOutputs, input);
        return { jobId: job.id };
      },
    }),
    defineTool({
      name: "generated-output-status",
      description: "Read typed output readback status",
      input: z.object({ jobId: z.string() }),
      output: z
        .object({ status: z.string(), result: readbackResult.optional() })
        .nullable(),
      async execute({ input }) {
        const status = await jobs.status(readGeneratedOutputs, input.jobId);
        return status
          ? {
              status: status.status,
              ...(status.result && { result: status.result }),
            }
          : null;
      },
    }),
    defineTool({
      name: "compile-reading-digest",
      description: "Compile a durable digest for a saved bookmark.",
      input: digestRequest,
      output: z.object({ jobId: z.string() }),
      confirmation: "Compile a reading digest?",
      async execute({ input }) {
        const job = await jobs.enqueue(compileReadingDigest, input);
        return { jobId: job.id };
      },
    }),
    defineTool({
      name: "generate-reading-content",
      description: "Generate independent digest and bookmark outputs.",
      input: digestRequest.extend({ dryRun: z.boolean().default(false) }),
      output: contentGenerationResultSchema,
      sideEffects: "writes",
      async execute({ input }) {
        return content.generate({
          dryRun: input.dryRun,
          targets: [
            content.target({
              template: "generatedDigest",
              context: { data: { bookmarkId: input.bookmarkId } },
              destination: {
                entity: readingDigest,
                idPath: [input.bookmarkId, "generated"],
                metadata: {
                  bookmarkId: input.bookmarkId,
                  title: "Generated digest",
                  wordCount: 0,
                },
              },
            }),
            content.target({
              template: "generatedBookmark",
              context: { data: { bookmarkId: input.bookmarkId } },
              destination: {
                entity: bookmark,
                idPath: [input.bookmarkId, "overview"],
                metadata: {
                  title: "Reading overview",
                  url: `https://example.test/reading/${encodeURIComponent(input.bookmarkId)}`,
                  tags: ["generated"],
                },
              },
            }),
          ],
        });
      },
    }),
    defineTool({
      name: "reading-digest-status",
      description: "Read one durable digest job status.",
      input: z.object({ jobId: z.string() }),
      output: digestStatus,
      sideEffects: "none",
      async execute({ input }) {
        const status = await jobs.status(compileReadingDigest, input.jobId);
        if (!status) throw new Error(`Digest job not found: ${input.jobId}`);
        return {
          status: status.status,
          progress: status.progress,
          ...(status.result ? { result: status.result } : {}),
          ...(status.error ? { error: status.error } : {}),
        };
      },
    }),
  ],
});
