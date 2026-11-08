import { describe, expect, it } from "bun:test";
import { topicsPluginConfigSchema } from "../src/schemas/config";

describe("topics plugin config", () => {
  it("drops the removed allow-list, legacy weights and lexical merge threshold", () => {
    const parsed = topicsPluginConfigSchema.parse({
      includeEntityTypes: ["post"],
      sourceWeights: { post: 0.5 },
      mintableEntityTypes: ["post"],
      mergeSimilarityThreshold: 0.9,
    });

    expect(parsed).toEqual(topicsPluginConfigSchema.parse({}));
    for (const removed of [
      "includeEntityTypes",
      "sourceWeights",
      "mintableEntityTypes",
      "mergeSimilarityThreshold",
    ]) {
      expect(parsed).not.toHaveProperty(removed);
    }
  });
});
