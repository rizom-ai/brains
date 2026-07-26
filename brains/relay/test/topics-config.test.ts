import { describe, expect, it } from "bun:test";
import relayBrain from "../src/index";

describe("Relay topics config", () => {
  it("uses default source selection instead of a model allow-list", () => {
    const topicsCapability = relayBrain.capabilities.find(
      ([id]) => id === "topics",
    );

    expect(topicsCapability).toBeDefined();
    const config = topicsCapability?.[2] as
      | {
          includeEntityTypes?: readonly string[];
          excludeEntityTypes?: readonly string[];
        }
      | undefined;

    expect(config?.includeEntityTypes).toBeUndefined();
    expect(config?.excludeEntityTypes).toBeUndefined();
  });
});
