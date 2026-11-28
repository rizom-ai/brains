import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  collectionMembersContract,
  collectionTypesContract,
} from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import type { ContentVisibility } from "@brains/plugins";
import { installTopics } from "./topics-plugins";

// Studio asks which entries belong to a topic: the topics plugin works that
// out from extraction's votes, so it answers for its own type.
describe("topic members for Studio", () => {
  async function harnessWith(
    topics: Array<[string, ContentVisibility]>,
  ): Promise<ReturnType<typeof createPluginHarness>> {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-topic-members-${randomUUID()}`,
    });
    await installTopics(harness);
    for (const [title, visibility] of topics)
      await harness.getEntityService().createEntity({
        entity: {
          id: title.toLowerCase().replaceAll(" ", "-"),
          entityType: "topic",
          content: `---\ntitle: ${title}\n---\nAbout ${title}.`,
          metadata: {},
          visibility,
        },
      });
    return harness;
  }

  it("answers for the topic type", async () => {
    const harness = await harnessWith([]);
    expect(
      collectionTypesContract.response.parse(
        await harness.sendMessage(collectionTypesContract.name, {}),
      ),
    ).toEqual({ types: ["topic"] });
  });

  it("answers the topics the asker can see, with their members", async () => {
    const harness = await harnessWith([
      ["Ecosystem Architecture", "public"],
      ["Private Plans", "restricted"],
    ]);
    expect(
      collectionMembersContract.response.parse(
        await harness.sendMessage(collectionMembersContract.name, {
          entityType: "topic",
          ids: ["ecosystem-architecture", "private-plans"],
          visibilityScope: "public",
        }),
      ),
    ).toEqual({
      collections: [{ id: "ecosystem-architecture", members: [] }],
    });
  });
});
