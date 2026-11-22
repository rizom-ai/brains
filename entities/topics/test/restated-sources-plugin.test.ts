import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { topicExtractionStores } from "../src/lib/topic-extraction-run";
import { installTopics } from "./topics-plugins";

/**
 * The shell announces the rows its quiet rewrite restated before startup
 * content settles; the topics plugin moves their votes to the new hash
 * then, so the extraction startup queues reads none of them again.
 */
describe("the topics plugin, told of restated rows", () => {
  it.each([true, false])(
    "moves their votes to the new hash (auto extraction=%s)",
    async (enableAutoExtraction) => {
      const harness = createPluginHarness({});
      await installTopics(harness, {
        enableAutoExtraction,
        excludeEntityTypes: ["prompt"],
      });
      const stores = topicExtractionStores(harness.getEntityContext("topics"));
      await stores.votes.set("post:one", {
        contentHash: "before",
        promptVersion: "v1",
        visibility: "public",
        supported: [],
        proposal: null,
      });

      await harness.sendMessage(
        SYSTEM_CHANNELS.entitiesRestated,
        {
          entities: [
            {
              entityType: "post",
              entityId: "one",
              previousHash: "before",
              contentHash: "after",
            },
          ],
        },
        "shell",
      );

      expect((await stores.votes.get("post:one"))?.contentHash).toBe("after");
    },
  );
});
