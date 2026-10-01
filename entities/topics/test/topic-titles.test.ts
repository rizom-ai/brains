import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { TOPIC_TITLES_MESSAGE } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import type { ContentVisibility } from "@brains/plugins";
import { TopicsPlugin } from "../src";

// Other plugins ask what the brain's public work is about, for example to
// screen a site visitor's question: the titles of its public topics.
describe("public topic titles", () => {
  async function harnessWith(
    topics: Array<[string, ContentVisibility]>,
  ): Promise<ReturnType<typeof createPluginHarness>> {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-topic-titles-${randomUUID()}`,
    });
    await harness.installPlugin(new TopicsPlugin());
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

  it("answers with the titles of public topics only", async () => {
    const harness = await harnessWith([
      ["Ecosystem Architecture", "public"],
      ["Trust Networks", "public"],
      ["Private Plans", "restricted"],
    ]);
    const response = await harness.sendMessage(TOPIC_TITLES_MESSAGE, {});
    expect(response).toEqual({
      titles: ["Ecosystem Architecture", "Trust Networks"],
    });
  });

  it("answers with at most twenty", async () => {
    const harness = await harnessWith(
      Array.from({ length: 25 }, (_, i): [string, ContentVisibility] => [
        `Topic ${String(i).padStart(2, "0")}`,
        "public",
      ]),
    );
    const response = await harness.sendMessage<
      Record<string, never>,
      { titles: string[] }
    >(TOPIC_TITLES_MESSAGE, {});
    expect(response?.titles).toHaveLength(20);
  });
});
