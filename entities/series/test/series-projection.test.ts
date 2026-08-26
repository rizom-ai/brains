import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  ProjectionExecutionContext,
  ProjectionInputContext,
} from "@brains/plugins";
import {
  createMockEntityPluginContext,
  createMockEntityService,
  createSilentLogger,
} from "@brains/test-utils";
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
  it("selects all series members and derives one series per distinct name", async () => {
    const rule = createSeriesProjectionRule(
      "@brains/series:series:description",
    );
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
    const rule = createSeriesProjectionRule(
      "@brains/series:series:description",
    );
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

/**
 * Which series the rule is allowed to remove.
 *
 * The rule derives public series, but selects the set it reconciles against
 * without a visibility filter — so a series the derivation was never looking
 * at can be swept up by it. `skill-projection` scopes the same selection;
 * these two are the same invariant written twice, and only one of them was
 * written correctly.
 */
function scopedInputContext(entities: BaseEntity[]): ProjectionInputContext {
  const entityTypes = [
    ...new Set(entities.map(({ entityType }) => entityType)),
  ];
  const service = createMockEntityService({
    entityTypes,
    listEntitiesImpl: async ({ entityType, options }) => {
      const scope = options?.filter?.visibilityScope;
      return entities
        .filter((candidate) => candidate.entityType === entityType)
        .filter(
          (candidate) => scope === undefined || candidate.visibility === scope,
        );
    },
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

describe("what a series derivation may delete", () => {
  it("leaves series outside the visibility it derives for alone", async () => {
    const rule = createSeriesProjectionRule(
      "@brains/series:series:description",
    );
    const signal = new AbortController().signal;

    const shared: BaseEntity = {
      ...entity({
        id: "beta",
        entityType: "series",
        content: "# Beta\n\n## Description\n\nA shared series.\n",
        metadata: { title: "Beta", slug: "beta" },
      }),
      visibility: "shared",
    };

    const selected = await rule.selectInput(
      { waveId: "wave-scope", inputs: [] },
      scopedInputContext([
        entity({
          id: "post-1",
          entityType: "post",
          metadata: { seriesName: "Alpha", title: "First" },
        }),
        entity({
          id: "alpha",
          entityType: "series",
          content: "# Alpha\n\n## Description\n\nA public series.\n",
          metadata: { title: "Alpha", slug: "alpha" },
        }),
        shared,
      ]),
      signal,
    );

    const { context } = executionContext();
    const intents = await rule.derive(selected, context, signal);

    // "Beta" has no member at this visibility, but it was never this
    // derivation's to remove.
    expect(intents.filter((intent) => intent.operation === "delete")).toEqual(
      [],
    );
  });
});
