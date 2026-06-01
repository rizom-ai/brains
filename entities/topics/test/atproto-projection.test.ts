import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { createTopicAtprotoProjection } from "../src/atproto-projection";
import { TopicsPlugin } from "../src";
import type { TopicEntity } from "../src/schemas/topic";

const topic: TopicEntity = {
  id: "topic-1",
  entityType: "topic",
  content:
    "---\ntitle: Networked Knowledge\n---\nA topic summary.\n\n## Sources\n\nLegacy source details.",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {},
};

describe("topic ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps topics to ai.rizom.brain.topic records", async () => {
    const projection = createTopicAtprotoProjection();

    const record = await projection.buildRecord({
      entity: topic,
      context: createPluginHarness().getServiceContext("topics"),
      config: {
        brainDid: "did:web:brain.example.com",
      },
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.topic",
      title: "Networked Knowledge",
      body: "A topic summary.",
      format: "text/markdown",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "topic",
      sourceEntityId: "topic-1",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("registers the topic projection when the topics plugin registers", async () => {
    const harness = createPluginHarness({ dataDir: "/tmp/test-topic-atproto" });
    await harness.installPlugin(
      new TopicsPlugin({ enableAutoExtraction: false }),
    );

    const projection = AtprotoProjectionRegistry.getInstance().get("topic");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.topic");
  });
});
