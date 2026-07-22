import { describe, expect, it } from "bun:test";
import { EntityRegistry } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { registerBrainCharacterSupport } from "../src/initialization/shell-registration";

describe("shell entity registration", () => {
  it("registers brain-character as excluded from derived projections", () => {
    const registry = EntityRegistry.createFresh(createSilentLogger());

    registerBrainCharacterSupport(registry, createSilentLogger());

    expect(registry.getEntityTypeConfig("brain-character")).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });
});
