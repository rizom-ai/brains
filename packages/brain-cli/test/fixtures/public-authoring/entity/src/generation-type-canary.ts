import {
  defineChannel,
  defineEntity,
  defineEntityJob,
  z,
  type AnyEntityJobDeclaration,
  type Channel,
  type EntityCreateAllocation,
  type EntityCreateDelegation,
  type EntityGenerationContext,
  type EntityGenerationDeclaration,
  type EntityGenerationLink,
  type EntityGenerationRequest,
  type EntityGenerationResult,
  type EntityJobContext,
  type EntityJobDeclaration,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const summaryMetadata = z.object({
  title: z.string(),
  bookmarkId: z.string(),
  status: z.enum(["generating", "ready", "failed"]).default("ready"),
});

const summaryInput = z.object({
  bookmarkId: z.string(),
  prompt: z.string().optional(),
});

function summaryRequest(prompt: string): EntityGenerationRequest {
  return { template: "summary", prompt, voice: true };
}

function coverLink(bookmarkId: string): EntityGenerationLink {
  return { entityType: "bookmark", entityId: bookmarkId, field: "summaryId" };
}

async function summarize(
  context: EntityGenerationContext<z.output<typeof summaryInput>>,
): Promise<EntityGenerationResult<typeof summaryMetadata>> {
  const saved = await context.entities.get(bookmark, context.input.bookmarkId);
  if (!saved) return { success: false, error: "The bookmark is gone" };
  await context.progress.report({ progress: 10, message: "Summarizing" });
  const { body } = await context.ai.generate(
    summaryRequest(context.input.prompt ?? saved.metadata.title),
    z.object({ body: z.string() }),
  );
  context.signal.throwIfAborted();
  return {
    success: true,
    id: context.entityId ?? `summary-${saved.id}`,
    content: body,
    metadata: { title: saved.metadata.title, bookmarkId: saved.id },
    linkInto: coverLink(saved.id),
  };
}

const generation: EntityGenerationDeclaration<
  typeof summaryInput,
  typeof summaryMetadata
> = { input: summaryInput, generate: summarize };

// An event every listening package hears, its payload typed by the channel.
const recounted: Channel<{ total: number; reason: string }> = defineChannel(
  "reading-library:recounted",
  z.object({ total: z.number().int(), reason: z.string() }),
);

async function recount(
  context: EntityJobContext<{ readonly reason: string }>,
): Promise<{ readonly total: number }> {
  const total = await context.entities.count(bookmark);
  await context.messaging.publish(recounted, {
    total,
    reason: context.input.reason,
  });
  return { total };
}

async function recountWrongly(
  context: EntityJobContext<{ readonly reason: string }>,
): Promise<void> {
  // @ts-expect-error A published payload is the one its channel declares.
  await context.messaging.publish(recounted, { total: "many" });
}
void recountWrongly;

const recountJob: EntityJobDeclaration<z.ZodObject<{ reason: z.ZodString }>> =
  defineEntityJob({
    input: z.object({ reason: z.string() }),
    handle: recount,
  });

const jobs: Readonly<Record<string, AnyEntityJobDeclaration>> = {
  summarize: defineEntityJob({
    input: summaryInput,
    generate: async (context) => summarize(context),
  }),
  recount: recountJob,
};

function summarizeLater(bookmarkId: string): EntityCreateDelegation {
  return { job: "summarize", input: { bookmarkId } };
}

async function allocateSummary(
  bookmarkId: string,
): Promise<EntityCreateAllocation<typeof summaryMetadata>> {
  return {
    create: {
      id: `summary-${bookmarkId}`,
      content: "",
      metadata: { title: "Summarizing", bookmarkId, status: "generating" },
    },
    delegate: summarizeLater(bookmarkId),
    attachment: ({ entityId }) => ({
      mediaType: "text/markdown",
      url: `/summaries/${entityId}`,
    }),
  };
}

export const summary = defineEntity({
  type: "bookmark-summary",
  purpose: "A generated summary of a saved page.",
  metadata: summaryMetadata,
  templates: {
    summary: {
      name: "summary",
      description: "Summarizes a saved page",
      schema: z.object({ body: z.string() }),
      basePrompt: "Summarize the saved page in two sentences.",
      requiredPermission: "trusted",
    },
  },
  stub: ({ id, title }) => ({
    content: "",
    metadata: { title, bookmarkId: id, status: "generating" },
  }),
  generation,
  jobs,
  create: {
    fromPrompt: {
      resolve: async ({ input }) =>
        input.sourceEntityId
          ? allocateSummary(input.sourceEntityId)
          : { refuse: "Name the bookmark to summarize" },
    },
    fromContent: {
      resolve: async () => ({
        delegate: { job: "recount", input: { reason: "pasted text" } },
      }),
    },
    // "generation" names the type's own generation: with nothing
    // allocated, it writes a new summary.
    fromAttachment: {
      resolve: async ({ input }) =>
        input.sourceEntityId
          ? {
              delegate: {
                job: "generation",
                input: { bookmarkId: input.sourceEntityId },
              },
            }
          : { refuse: "Name the bookmark to summarize" },
    },
  },
});

export const invalidGenerationResult: EntityGenerationResult<
  typeof summaryMetadata
> = {
  success: true,
  content: "",
  // @ts-expect-error Generated metadata is the type's own schema input.
  metadata: { title: "Missing its bookmark" },
};

// @ts-expect-error A link names the field or list it writes.
export const invalidLink: EntityGenerationLink = {
  entityType: "bookmark",
  entityId: "saved",
};

export const invalidRequest: EntityGenerationRequest = {
  template: "summary",
  prompt: "x",
  // @ts-expect-error Represented identity is a closed vocabulary.
  representedIdentity: "editor",
};

export const invalidJob = defineEntityJob({
  input: z.object({ reason: z.string() }),
  // @ts-expect-error A job's input is what its schema parses.
  handle: async ({ input }) => input.count,
});
