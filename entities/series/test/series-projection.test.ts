import { createMockEntityService } from "@brains/entity-service/test";
import { createMockEntityPluginContext } from "@brains/plugins/test";
import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  ListEntitiesRequest,
  ProjectionExecutionContext,
  ProjectionInputContext,
} from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { createSeriesProjectionRule } from "../src/lib/series-projection";

function entity(input: {
  id: string;
  entityType: string;
  content?: string;
  metadata: Record<string, unknown>;
}): BaseEntity {
  return {
    id: input.id,
    entityType: input.entityType,
    content: input.content ?? `# ${input.id}`,
    contentHash: `hash:${input.id}`,
    metadata: input.metadata,
    visibility: "public",
    created: "2025-01-01T00:00:00.000Z",
    updated: "2025-01-01T00:00:00.000Z",
  };
}

function inputContext(entities: BaseEntity[]): ProjectionInputContext {
  const entityTypes = [
    ...new Set(entities.map(({ entityType }) => entityType)),
  ];
  const service = createMockEntityService({
    entityTypes,
    listEntitiesImpl: async ({ entityType }) =>
      entities.filter((candidate) => candidate.entityType === entityType),
    getEntityImpl: async ({ entityType, id }) =>
      entities.find(
        (candidate) =>
          candidate.entityType === entityType && candidate.id === id,
      ) ?? null,
  });
  return {
    entities: service,
    resolvePrompt: async (_reference, fallback) => fallback,
    appInfo: async (): Promise<never> => {
      throw new Error("not used");
    },
    identityInput: () => ({}),
  };
}

function executionContext(description = "A connected body of work."): {
  context: ProjectionExecutionContext;
  generate: ProjectionExecutionContext["ai"]["generate"];
} {
  const pluginContext = createMockEntityPluginContext({
    returns: { ai: { generate: { description } } },
  });
  return {
    context: {
      ai: pluginContext.ai,
      logger: createSilentLogger("series-projection-test"),
    },
    generate: pluginContext.ai.generate,
  };
}

describe("series projection rule", () => {
  it("passes voice guidance to series descriptions without injecting identity", async () => {
    const rule = createSeriesProjectionRule("series:description");
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "style-guide",
          entityType: "style-guide",
          content:
            "---\nname: Voice\nvoice:\n  summary: Plain and exact\n---\n",
          metadata: {},
        }),
        entity({
          id: "post-1",
          entityType: "post",
          metadata: { title: "Post one", seriesName: "Systems" },
        }),
      ]),
      signal,
    );
    const { context, generate } = executionContext();

    await rule.derive(selected, context, signal);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "series:description",
        representedIdentity: "none",
        styleGuide: { voice: expect.stringContaining("Plain and exact") },
      }),
      expect.anything(),
    );
  });

  it("selects all series members and derives one series per distinct name", async () => {
    const rule = createSeriesProjectionRule("series:description");
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "post-1",
          entityType: "post",
          metadata: {
            title: "Post one",
            excerpt: "First",
            seriesName: "Systems",
          },
        }),
        entity({
          id: "deck-1",
          entityType: "deck",
          metadata: { title: "Deck one", seriesName: "Practice" },
        }),
      ]),
      signal,
    );
    const { context, generate } = executionContext();

    const intents = await rule.derive(selected, context, signal);

    expect(intents).toHaveLength(2);
    expect(intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "upsert",
          entity: expect.objectContaining({
            id: "practice",
            entityType: "series",
            metadata: { title: "Practice", slug: "practice" },
          }),
        }),
        expect.objectContaining({
          operation: "upsert",
          entity: expect.objectContaining({
            id: "systems",
            entityType: "series",
            metadata: { title: "Systems", slug: "systems" },
          }),
        }),
      ]),
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("preserves described series and deletes every orphan without a model call", async () => {
    const describedContent =
      "---\ntitle: Systems\nslug: systems\n---\n\n## Description\n\nExisting description.";
    const rule = createSeriesProjectionRule("series:description");
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "post-1",
          entityType: "post",
          metadata: { title: "Post one", seriesName: "Systems" },
        }),
        entity({
          id: "systems",
          entityType: "series",
          content: describedContent,
          metadata: { title: "Systems", slug: "systems" },
        }),
        entity({
          id: "orphan",
          entityType: "series",
          metadata: { title: "Orphan", slug: "orphan" },
        }),
      ]),
      signal,
    );
    const { context, generate } = executionContext();

    const intents = await rule.derive(selected, context, signal);

    expect(intents).toEqual([
      {
        operation: "upsert",
        entity: {
          id: "systems",
          entityType: "series",
          content: describedContent,
          metadata: { title: "Systems", slug: "systems" },
          visibility: "public",
        },
      },
      { operation: "delete", entityType: "series", id: "orphan" },
    ]);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("series projection rule on declared series reads", () => {
  // A declared series reads back its body alone; its stored record keeps
  // the frontmatter, as the series plugin class stored and read it.
  const stored =
    "---\ntitle: Systems\nslug: systems\ncoverImageId: systems-cover\n---\n# Systems\n\n## Description\nExisting description.\n";
  const body = "# Systems\n\n## Description\nExisting description.\n";

  function declaredContext(): {
    context: ProjectionInputContext;
    reads: ListEntitiesRequest[];
  } {
    const members = [
      entity({
        id: "post-1",
        entityType: "post",
        metadata: { title: "Post one", seriesName: "Systems" },
      }),
    ];
    const reads: ListEntitiesRequest[] = [];
    const service = createMockEntityService({
      entityTypes: ["post", "series"],
      listEntitiesImpl: async (request) => {
        reads.push(request);
        if (request.entityType !== "series") return members;
        return [
          entity({
            id: "systems",
            entityType: "series",
            content: request.options?.source === true ? stored : body,
            metadata: {
              title: "Systems",
              slug: "systems",
              coverImageId: "systems-cover",
            },
          }),
        ];
      },
      getEntityImpl: async () => null,
    });
    return {
      reads,
      context: {
        entities: service,
        resolvePrompt: async (_reference, fallback) => fallback,
        appInfo: async (): Promise<never> => {
          throw new Error("not used");
        },
        identityInput: () => ({}),
      },
    };
  }

  it("selects an existing series as stored, so its input and fingerprint stay those the class read", async () => {
    const rule = createSeriesProjectionRule("series:description");
    const { context } = declaredContext();

    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      context,
      new AbortController().signal,
    );

    expect(selected).toEqual({
      members: [
        {
          id: "post-1",
          seriesName: "Systems",
          title: "Post one",
          excerpt: null,
        },
      ],
      existingSeries: [
        {
          id: "systems",
          content: stored,
          title: "Systems",
          slug: "systems",
          visibility: "public",
          hasDescription: true,
        },
      ],
      voiceGuidance: "",
    });
  });

  it("keeps a projected series' frontmatter and cover", async () => {
    const rule = createSeriesProjectionRule("series:description");
    const signal = new AbortController().signal;
    const { context } = declaredContext();
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      context,
      signal,
    );
    const { context: execution, generate } = executionContext();

    const intents = await rule.derive(selected, execution, signal);

    expect(intents).toEqual([
      {
        operation: "upsert",
        entity: {
          id: "systems",
          entityType: "series",
          content: stored,
          metadata: {
            title: "Systems",
            slug: "systems",
            coverImageId: "systems-cover",
          },
          visibility: "public",
        },
      },
    ]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("describes through the description template under its registered name", async () => {
    const rule = createSeriesProjectionRule("another:description");
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-1", inputs: [] },
      inputContext([
        entity({
          id: "post-1",
          entityType: "post",
          metadata: { title: "Post one", seriesName: "Systems" },
        }),
      ]),
      signal,
    );
    const { context, generate } = executionContext();

    await rule.derive(selected, context, signal);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: "another:description" }),
      expect.anything(),
    );
  });
});
