import {
  defineEntity,
  z,
  type EntityAgentContextProvider,
  type EntityEvalContext,
  type EntityEvalDeclaration,
  type EntityEvalFixtures,
  type EntityScheduledGenerationDeclaration,
} from "@rizom/brain/entities";
import { bookmark } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
const weeklyMetadata = z.object({
  title: z.string(),
  sourceEntityType: z.string().optional(),
  sourceEntityIds: z.array(z.string()).optional(),
});

const fromBookmarks: EntityScheduledGenerationDeclaration = {
  from: { entityType: "bookmark", limit: 20 },
  mode: "batch",
};

const recentReading: EntityAgentContextProvider = async ({
  request,
  entities,
}) => {
  const saved = await entities.list(bookmark, { limit: 5 });
  return saved.map((entry) => ({
    id: entry.id,
    source: "weekly-reading",
    title: entry.metadata.title,
    content: `${entry.metadata.url} (asked: ${request.message})`,
  }));
};

async function seedBookmark(
  fixtures: EntityEvalFixtures,
  id: string,
): Promise<void> {
  await fixtures.seed({
    id,
    entityType: "bookmark",
    content: `Saved ${id}`,
    metadata: { url: `https://example.test/${id}`, title: id },
    visibility: "public",
  });
}

async function measureRecall(
  input: unknown,
  { entities, fixtures }: EntityEvalContext,
): Promise<{ readonly count: number }> {
  const { ids } = z.object({ ids: z.array(z.string()) }).parse(input);
  await fixtures.reset({ visibilityScope: "restricted" });
  await Promise.all(ids.map((id) => seedBookmark(fixtures, id)));
  await fixtures.settleEmbeddings();
  return { count: await entities.count(bookmark) };
}

const evals: EntityEvalDeclaration = {
  recall: measureRecall,
  weekly: async (_input, { ai }) =>
    ai.generate(
      { template: "weekly", prompt: "This week", voice: true },
      z.object({ body: z.string() }),
    ),
};

export const weeklyReading = defineEntity({
  type: "weekly-reading",
  purpose: "A weekly note on what was saved.",
  metadata: weeklyMetadata,
  instructions:
    "For questions about recent reading, answer from the newest weekly note.",
  templates: {
    weekly: {
      name: "weekly",
      description: "Writes the weekly reading note",
      schema: z.object({ body: z.string() }),
      basePrompt: "Write a short note on this week's saved pages.",
      requiredPermission: "trusted",
    },
  },
  generation: {
    input: z.object({ sourceEntityIds: z.array(z.string()).optional() }),
    generate: async ({ ai, input }) => {
      const { body } = await ai.generate(
        { template: "weekly", prompt: "This week", voice: true },
        z.object({ body: z.string() }),
      );
      return {
        success: true,
        content: body,
        metadata: {
          title: "This week",
          sourceEntityType: "bookmark",
          sourceEntityIds: input.sourceEntityIds ?? [],
        },
      };
    },
  },
  scheduledGeneration: fromBookmarks,
  agentContext: recentReading,
  evals,
});

export const invalidSchedule: EntityScheduledGenerationDeclaration = {
  from: { entityType: "bookmark", limit: 5 },
  // @ts-expect-error A schedule writes from each source or from all at once.
  mode: "daily",
};

export const invalidItems: Awaited<ReturnType<EntityAgentContextProvider>> = [
  // @ts-expect-error An agent context item names its id, source and content.
  { title: "Untitled" },
];

export async function invalidFixtures(
  fixtures: EntityEvalFixtures,
): Promise<void> {
  // @ts-expect-error Fixture visibility is a content visibility.
  await fixtures.reset({ visibilityScope: "private" });
}
