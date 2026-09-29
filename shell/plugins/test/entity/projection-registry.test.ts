import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineProjectionRule, type ProjectionRule } from "../../src";
import { ProjectionRegistry } from "../../src/entity/projection-registry";

const entityTypes = [
  { type: "document", projectionSource: true },
  { type: "topic", projectionSource: false },
  { type: "skill", projectionSource: false },
  { type: "swot", projectionSource: false },
] as const;

function rule(input: {
  id: string;
  targetType: string;
  types: string[];
  excludeTypes?: string[];
}): ProjectionRule {
  return defineProjectionRule({
    id: input.id,
    version: "1",
    targets: { authority: "additive" } as const,
    targetType: input.targetType,
    sources: [
      {
        kind: "entity",
        types: input.types,
        ...(input.excludeTypes ? { excludeTypes: input.excludeTypes } : {}),
      },
    ],
    inputSchema: z.object({}),
    selectInput: async () => ({}),
    derive: async () => [],
  });
}

describe("ProjectionRegistry", () => {
  it("expands wildcard entity sources without consuming excluded outputs", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.registerRule(
      "topics",
      rule({
        id: "topic-projection",
        targetType: "topic",
        types: ["*"],
        excludeTypes: ["topic"],
      }),
    );
    registry.registerRule(
      "skills",
      rule({
        id: "skill-projection",
        targetType: "skill",
        types: ["topic"],
      }),
    );

    const graph = registry.validate(entityTypes);

    expect(graph.projections.map((projection) => projection.id)).toEqual([
      "skill-projection",
      "topic-projection",
    ]);
    expect(graph.edges).toEqual([
      {
        from: "topic-projection",
        to: "skill-projection",
        causes: ["entity:topic"],
      },
    ]);
    expect(
      graph.projections.every(
        (projection) => !("executionOwner" in projection),
      ),
    ).toBe(true);
  });

  it("rejects cycles in scheduler rules", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.registerRule(
      "topics",
      rule({
        id: "topic-projection",
        targetType: "topic",
        types: ["document"],
      }),
    );
    registry.registerRule(
      "skills",
      rule({
        id: "skill-projection",
        targetType: "skill",
        types: ["topic"],
      }),
    );
    registry.registerRule(
      "documents",
      rule({
        id: "document-projection",
        targetType: "document",
        types: ["skill"],
      }),
    );

    expect(() => registry.validate(entityTypes)).toThrow(
      "Projection cycle is not supported: document-projection -> topic-projection -> skill-projection -> document-projection",
    );
  });

  it("rejects duplicate projection rule IDs", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.registerRule(
      "first",
      rule({
        id: "shared-projection",
        targetType: "topic",
        types: ["document"],
      }),
    );

    expect(() =>
      registry.registerRule(
        "second",
        rule({
          id: "shared-projection",
          targetType: "skill",
          types: ["document"],
        }),
      ),
    ).toThrow(
      'Projection "shared-projection" is already registered by "first"',
    );
  });

  it("surfaces entity source types that no plugin registered", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.registerRule(
      "topics",
      rule({
        id: "topic-projection",
        targetType: "topic",
        types: ["document", "documnet"],
      }),
    );

    expect(registry.validate(entityTypes).unknownSourceTypes).toEqual([
      { projectionId: "topic-projection", types: ["documnet"] },
    ]);
  });

  it("reports no unknown source types for wildcard and registered exclusions", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.registerRule(
      "topics",
      rule({
        id: "topic-projection",
        targetType: "topic",
        types: ["*"],
        excludeTypes: ["swot"],
      }),
    );

    expect(registry.validate(entityTypes).unknownSourceTypes).toEqual([]);
  });

  it("registers immutable executable rules as the only graph contract", () => {
    const registry = ProjectionRegistry.createFresh();
    const topicRule = rule({
      id: "topic-rule",
      targetType: "topic",
      types: ["document"],
    });

    registry.registerRule("topics", topicRule);

    expect(registry.listRules()).toEqual([topicRule]);
    expect(registry.validate(entityTypes).projections).toEqual([
      {
        id: "topic-rule",
        pluginId: "topics",
        targetType: "topic",
        sources: [{ kind: "entity", types: ["document"] }],
      },
    ]);

    registry.unregisterPlugin("topics");
    expect(registry.listRules()).toEqual([]);
    expect(registry.list()).toEqual([]);
  });
});

describe("a conversation source in the graph", () => {
  it("is not reported as an unknown entity type", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.registerRule(
      "conversation-memory",
      defineProjectionRule({
        id: "summary-derivation",
        version: "1",
        sources: [{ kind: "conversation" }],
        targetType: "summary",
        targets: { authority: "exclusive", visibility: "shared" },
        inputSchema: z.object({}),
        selectInput: async () => ({}),
        derive: async () => [],
      }),
    );

    // "conversation" is a source the runtime polls, not an entity type
    // anyone registered — validation must not read it as a missing one.
    expect(
      registry.validate([{ type: "summary", projectionSource: false }])
        .unknownSourceTypes,
    ).toEqual([]);
  });
});
