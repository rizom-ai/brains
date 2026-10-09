import { describe, expect, it, spyOn } from "bun:test";
import { installTopics } from "./helpers/install";

describe("retired topic projection handoff", () => {
  it.each([true, false])(
    "releases only the exact retired rule/version during registration (enabled=%s)",
    async (enabled) => {
      const releases: unknown[] = [];
      const { harness } = await installTopics({
        config: { enableAutoExtraction: enabled },
        beforeInstall: (harness) => {
          spyOn(
            harness.getEntityService(),
            "releaseProjectionOwnership",
          ).mockImplementation(async (request) => {
            releases.push(request);
          });
        },
      });
      try {
        expect(releases).toEqual([
          {
            entityType: "topic",
            ruleId: "topics-projection",
            ruleVersion: "1",
          },
        ]);
        await harness.sendMessage(
          "sync:initial:completed",
          { success: true },
          "directory-sync",
        );
        expect(releases).toHaveLength(1);
      } finally {
        await harness.reset();
      }
    },
  );
});
