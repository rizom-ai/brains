import { describe, expect, it } from "bun:test";
import topicsPackage from "../src";
import { topicsPluginConfigSchema } from "../src/schemas/config";
import { installTopics, TOPIC_JOB } from "./helpers/install";

describe("declarative Topics package", () => {
  it("bounds source batching delays to the durable scheduling capability", () => {
    for (const sourceChangeBatchDelayMs of [0, 86_400_000])
      expect(
        topicsPluginConfigSchema.safeParse({ sourceChangeBatchDelayMs })
          .success,
      ).toBe(true);
    for (const sourceChangeBatchDelayMs of [-1, 0.5, 86_400_001])
      expect(
        topicsPluginConfigSchema.safeParse({ sourceChangeBatchDelayMs })
          .success,
      ).toBe(false);
  });
  it("declares owned content and ranked maintenance without native projection bridges", async () => {
    const { harness, capabilities, registerHandler } = await installTopics();
    try {
      expect(topicsPackage.kind).toBe("rizom-plugin-package");
      expect(
        harness.getEntityRegistry().getEntityTypeConfig("topic"),
      ).toMatchObject({
        projectionSource: false,
        projectionSourceRole: "excluded",
      });
      expect(
        capabilities.every((value) => !value.projectionRules?.length),
      ).toBe(true);
      expect(registerHandler).toHaveBeenCalledWith(
        TOPIC_JOB,
        expect.anything(),
        "@brains/topics:topics",
      );
      expect("TopicsPlugin" in topicsPackage).toBe(false);
    } finally {
      await harness.reset();
    }
  });
});
