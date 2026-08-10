import { bookmark } from "@fixture/reading-entities";
import {
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
  },

  // A same-name view reuses the exact schema object and adds web rendering.
  views: {
    digest: {
      schema: digestResult,
      description: "A compact reading-digest result.",
      renderers: {
        web: ({ summary, wordCount }): string =>
          `<article><strong>${summary}</strong><small>${wordCount} words</small></article>`,
      },
    },
  },

  // Binding with .handle() keeps the contract importable without its executor.
  jobs: ({ state }) => [
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
  tools: ({ jobs }) => [
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
