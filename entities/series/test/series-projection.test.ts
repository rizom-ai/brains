import { describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  ProjectionExecutionContext,
  ProjectionInputContext,
} from "@brains/plugins";
import { PROJECTION_ABSTAINED } from "@brains/plugins";
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

  it("preserves a described series without a model call", async () => {
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
    ]);
    expect(generate).not.toHaveBeenCalled();
  });
});

/**
 * Which series the rule is allowed to remove.
 *
 * It no longer removes any itself — the runtime does, from what the rule
 * declares. That declaration is the whole guard now: exclusive over public
 * series and nothing else. It was a hand-written diff that selected its
 * comparison set unscoped, so a public derivation deleted `shared` series.
 */
describe("what a series derivation may delete", () => {
  it("claims authority over public series only", () => {
    const rule = createSeriesProjectionRule(
      "@brains/series:series:description",
    );

    expect(rule.targets).toEqual({
      authority: "exclusive",
      visibility: "public",
    });
  });

  it("emits no deletions of its own", async () => {
    const rule = createSeriesProjectionRule(
      "@brains/series:series:description",
    );
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-scope", inputs: [] },
      inputContext([
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
      ]),
      signal,
    );

    const { context } = executionContext();
    const intents = await rule.derive(selected, context, signal);
    if (!Array.isArray(intents)) {
      throw new Error("Expected the rule to derive rather than abstain");
    }

    expect(intents.filter((intent) => intent.operation === "delete")).toEqual(
      [],
    );
  });

  it("abstains rather than claiming every series should go", async () => {
    // Nothing indexed yet is not "no content belongs to any series". Read as
    // an empty desired set it would remove every series the brain has.
    const rule = createSeriesProjectionRule(
      "@brains/series:series:description",
    );
    const signal = new AbortController().signal;
    const selected = await rule.selectInput(
      { waveId: "wave-empty", inputs: [] },
      inputContext([
        entity({
          id: "alpha",
          entityType: "series",
          content: "# Alpha\n\n## Description\n\nA public series.\n",
          metadata: { title: "Alpha", slug: "alpha" },
        }),
      ]),
      signal,
    );

    const { context } = executionContext();

    expect(await rule.derive(selected, context, signal)).toBe(
      PROJECTION_ABSTAINED,
    );
  });
});
