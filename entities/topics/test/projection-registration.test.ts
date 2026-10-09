import { describe, expect, it } from "bun:test";
import { expectTemplateDataSourcesResolve } from "@brains/plugins/test";
import { installTopics, TOPIC_JOB } from "./helpers/install";

describe("Topics installation", () => {
  it("registers maintenance without scheduling a scan during registration", async () => {
    const { capabilities, enqueue, registerHandler, harness } =
      await installTopics();
    try {
      expect(
        capabilities.flatMap((entry) => entry.projectionRules ?? []),
      ).toEqual([]);
      expect(registerHandler).toHaveBeenCalledWith(
        TOPIC_JOB,
        expect.anything(),
        "@brains/topics:topics",
      );
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await harness.reset();
    }
  });
  it("resolves declared data sources and both installed generation templates", async () => {
    const { harness } = await installTopics({
      config: { enableAutoExtraction: false },
    });
    try {
      expectTemplateDataSourcesResolve(harness);
      expect(harness.getTemplates().has("@brains/topics:topic:votes")).toBe(
        true,
      );
      expect(
        harness.getTemplates().has("@brains/topics:topic:description"),
      ).toBe(true);
    } finally {
      await harness.reset();
    }
  });
});
