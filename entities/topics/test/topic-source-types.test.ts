import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { TOPIC_SOURCE_TYPES_MESSAGE } from "@brains/contracts";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { TopicsPlugin } from "../src";

class Adapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string) {
    super({
      entityType,
      purpose: "Topic source types fixture",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return { content };
  }
}

// Other plugins draw the knowledge map from the same sources topics are
// drawn from, so a territory and its topic measure against the same corpus.
describe("topic source types", () => {
  it("answers with the types topics are drawn from", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-topic-source-types-${randomUUID()}`,
    });
    await harness.installPlugin(new TopicsPlugin());
    const registry = harness.getEntityRegistry();
    registry.registerEntityType("note", baseEntitySchema, new Adapter("note"));
    registry.registerEntityType(
      "skill",
      baseEntitySchema,
      new Adapter("skill"),
      { projectionSource: false },
    );

    const response = await harness.sendMessage<
      Record<string, never>,
      { types: string[] }
    >(TOPIC_SOURCE_TYPES_MESSAGE, {});

    expect(response?.types).toContain("note");
    expect(response?.types).not.toContain("skill");
    expect(response?.types).not.toContain("topic");
  });
});
