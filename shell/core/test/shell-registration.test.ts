import { describe, expect, it, mock } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import type { IEntityRegistry } from "@brains/entity-service";
import { registerCanonicalIdentityLinkSupport } from "../src/initialization/shell-registration";

function createMockRegistry(): IEntityRegistry {
  return {
    registerEntityType: mock(() => {}),
  } as unknown as IEntityRegistry;
}

describe("shell registration", () => {
  it("registers canonical identity link entity support", () => {
    const registry = createMockRegistry();

    registerCanonicalIdentityLinkSupport(registry, createSilentLogger());

    expect(registry.registerEntityType).toHaveBeenCalledWith(
      "canonical-identity-link",
      expect.anything(),
      expect.anything(),
    );
  });
});
