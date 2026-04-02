import { describe, it, expect, beforeEach } from "bun:test";
import { EntityRegistry, baseEntitySchema } from "@brains/entity-service";
import type { BaseEntity, EntityAdapter } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";

const testSchema = baseEntitySchema.extend({
  entityType: z.literal("test"),
});

const testAdapter = {
  entityType: "test",
  toMarkdown: () => "",
  fromMarkdown: () => ({}),
} as unknown as EntityAdapter<BaseEntity>;

/**
 * Regression: Multi-model eval fails on second model because singletons
 * (EntityRegistry, Shell, etc.) aren't reset between iterations.
 *
 * The second App.create() + initialize() tries to register entity types
 * that are already in the singleton EntityRegistry, causing:
 *   "Entity type registration failed for brain-character: Entity type is already registered"
 *
 * The fix must reset singletons between model runs.
 */
describe("multi-model boot: singleton reset between runs", () => {
  beforeEach(() => {
    EntityRegistry.resetInstance();
  });

  it("should fail to register same entity type twice without reset", () => {
    const registry = EntityRegistry.getInstance(createSilentLogger());

    registry.registerEntityType("test", testSchema, testAdapter);

    expect(() =>
      registry.registerEntityType("test", testSchema, testAdapter),
    ).toThrow(/already registered/);
  });

  it("should succeed after resetInstance", () => {
    const registry = EntityRegistry.getInstance(createSilentLogger());

    registry.registerEntityType("test", testSchema, testAdapter);

    EntityRegistry.resetInstance();

    const freshRegistry = EntityRegistry.getInstance(createSilentLogger());
    expect(() =>
      freshRegistry.registerEntityType("test", testSchema, testAdapter),
    ).not.toThrow();
  });
});
