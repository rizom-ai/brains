import { describe, expect, it } from "bun:test";
import relayBrain from "../src/index";

describe("Relay topics config", () => {
  it("uses durable source entities and excludes derived skills", () => {
    const topicsCapability = relayBrain.capabilities.find(
      ([id]) => id === "topics",
    );

    expect(topicsCapability).toBeDefined();
    const config = topicsCapability?.[2] as
      | { includeEntityTypes?: readonly string[] }
      | undefined;

    expect(config?.includeEntityTypes).toContain("summary");
    expect(config?.includeEntityTypes).not.toContain("skill");
  });
});
