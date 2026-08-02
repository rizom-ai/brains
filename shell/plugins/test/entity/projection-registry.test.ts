import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineProjectionRule } from "../../src";
import { ProjectionRegistry } from "../../src/entity/projection-registry";

const entityTypes = [
  { type: "document", projectionSource: true },
  { type: "topic", projectionSource: false },
  { type: "skill", projectionSource: false },
  { type: "swot", projectionSource: false },
] as const;

describe("ProjectionRegistry", () => {
  it("expands wildcard entity sources without consuming excluded outputs", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["*"] }],
      emittedEvents: ["topics:batch-completed"],
    });
    registry.register("skills", {
      id: "skill-projection",
      targetType: "skill",
      sources: [{ kind: "event", events: ["topics:batch-completed"] }],
    });

    const graph = registry.validate(entityTypes);

    expect(graph.projections.map((projection) => projection.id)).toEqual([
      "skill-projection",
      "topic-projection",
    ]);
    expect(graph.edges).toEqual([
      {
        from: "topic-projection",
        to: "skill-projection",
        causes: ["event:topics:batch-completed"],
      },
    ]);
  });

  it("rejects cycles that cross entity and semantic event edges", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["document"] }],
      emittedEvents: ["topics:batch-completed"],
    });
    registry.register("skills", {
      id: "skill-projection",
      targetType: "skill",
      sources: [{ kind: "event", events: ["topics:batch-completed"] }],
    });
    registry.register("documents", {
      id: "document-projection",
      targetType: "document",
      sources: [{ kind: "entity", types: ["skill"] }],
    });

    expect(() => registry.validate(entityTypes)).toThrow(
      "Projection cycle is not supported: document-projection -> topic-projection -> skill-projection -> document-projection",
    );
  });

  it("rejects cycles even when every participant declares feedback", () => {
    const registry = ProjectionRegistry.createFresh();
    const feedback = {
      allowed: true as const,
      convergenceRule: "Persisted input fingerprints make repeats no-ops",
      deduplicationKey: "projection-wave",
      maxDepth: 3,
    };
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["document"] }],
      feedback,
    });
    registry.register("documents", {
      id: "document-projection",
      targetType: "document",
      sources: [{ kind: "entity", types: ["topic"] }],
      feedback,
    });

    expect(() => registry.validate(entityTypes)).toThrow(
      "Projection cycle is not supported",
    );
  });

  it("rejects a cycle with only a partially declared feedback policy", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["document"] }],
      feedback: {
        allowed: true,
        convergenceRule: "Fingerprint convergence",
        deduplicationKey: "topics",
        maxDepth: 2,
      },
    });
    registry.register("documents", {
      id: "document-projection",
      targetType: "document",
      sources: [{ kind: "entity", types: ["topic"] }],
    });

    expect(() => registry.validate(entityTypes)).toThrow(
      "Projection cycle is not supported",
    );
  });

  it("rejects duplicate projection IDs and invalid feedback declarations", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("first", {
      id: "shared-projection",
      targetType: "topic",
      sources: [],
    });

    expect(() =>
      registry.register("second", {
        id: "shared-projection",
        targetType: "skill",
        sources: [],
      }),
    ).toThrow(
      'Projection "shared-projection" is already registered by "first"',
    );

    expect(() =>
      registry.register("invalid", {
        id: "invalid-feedback",
        targetType: "topic",
        sources: [],
        feedback: {
          allowed: true,
          convergenceRule: "",
          deduplicationKey: "",
          maxDepth: 0,
        },
      }),
    ).toThrow();
  });

  it("surfaces entity source types that no plugin registered", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [
        { kind: "entity", types: ["document", "documnet"] },
        { kind: "event", events: ["sync:completed"] },
      ],
    });

    const graph = registry.validate(entityTypes);

    expect(graph.unknownSourceTypes).toEqual([
      { projectionId: "topic-projection", types: ["documnet"] },
    ]);
  });

  it("reports no unknown source types for wildcard and registered sources", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["*"], excludeTypes: ["swot"] }],
    });

    const graph = registry.validate(entityTypes);

    expect(graph.unknownSourceTypes).toEqual([]);
  });

  it("rejects graph edges that cross execution owners", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["document"] }],
      executionOwner: "event-owned",
    });
    registry.register("skills", {
      id: "skill-projection",
      targetType: "skill",
      sources: [{ kind: "entity", types: ["topic"] }],
      executionOwner: "wave-owned",
    });

    expect(() => registry.validate(entityTypes)).toThrow(
      'Projection edge "topic-projection" -> "skill-projection" crosses execution owners',
    );
  });

  it("privately registers executable rules as wave-owned declarations", () => {
    const registry = ProjectionRegistry.createFresh();
    const rule = defineProjectionRule({
      id: "topic-rule",
      version: "1",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["document"] }],
      inputSchema: z.object({}),
      selectInput: async () => ({}),
      derive: async () => [],
    });

    registry.registerRule("topics", rule);

    expect(registry.listRules()).toEqual([rule]);
    expect(registry.validate(entityTypes).projections).toEqual([
      expect.objectContaining({
        id: "topic-rule",
        executionOwner: "wave-owned",
      }),
    ]);

    registry.unregisterPlugin("topics");
    expect(registry.listRules()).toEqual([]);
  });

  it("unregisters all declarations owned by a plugin", () => {
    const registry = ProjectionRegistry.createFresh();
    registry.register("topics", {
      id: "topic-projection",
      targetType: "topic",
      sources: [],
    });
    registry.register("topics", {
      id: "topic-rebuild",
      targetType: "topic",
      sources: [],
    });

    registry.unregisterPlugin("topics");

    expect(registry.list()).toEqual([]);
  });
});
