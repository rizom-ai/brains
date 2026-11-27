import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { entityDisplayTitle } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { installTopics } from "./topics-plugins";

// A topic indexes nothing in its metadata: its title is its document's
// header. The ⌘K palette and Studio's activity feed name entries by the
// shared display-title rule, so a topic must answer it with that header
// rather than leave them its id.
describe("a topic's display title", () => {
  it("is the title its document's header states", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-topic-display-title-${randomUUID()}`,
    });
    await installTopics(harness);
    await harness.getEntityService().createEntity({
      entity: {
        id: "sustainability-data-systems",
        entityType: "topic",
        content:
          "---\ntitle: Sustainability Data Systems\n---\nVerifiable reporting.",
        metadata: {},
        visibility: "public",
      },
    });
    const topic = await harness.getEntityService().getEntity({
      entityType: "topic",
      id: "sustainability-data-systems",
    });
    if (!topic) throw new Error("Missing topic");
    expect(entityDisplayTitle(harness.getEntityRegistry(), topic)).toBe(
      "Sustainability Data Systems",
    );
  });
});
