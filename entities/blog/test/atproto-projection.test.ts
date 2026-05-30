import { beforeEach, describe, expect, it } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import {
  createMockServicePluginContext,
  createMockShell,
} from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto";
import { BlogPlugin } from "../src/plugin";
import { createBlogAtprotoProjection } from "../src/atproto-projection";
import { createMockPost } from "./fixtures/blog-entities";

describe("blog ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps blog posts to ai.rizom.brain.post records", async () => {
    const projection = createBlogAtprotoProjection();
    const entity = createMockPost(
      "post-1",
      "Distributed Brains",
      "distributed-brains",
      "published",
      { publishedAt: "2026-05-28T12:00:00.000Z" },
    );

    const record = await projection.buildRecord({
      entity,
      context: createMockServicePluginContext(),
      config: {
        enabled: true,
        pdsEndpoint: "https://bsky.social",
        brainDid: "did:web:brain.example.com",
      },
      topics: ["protocols"],
    });

    expect(projection.entityType).toBe("post");
    expect(projection.collection).toBe("ai.rizom.brain.post");
    expect(projection.validate).toBe(false);
    expect(record).toMatchObject({
      $type: "ai.rizom.brain.post",
      title: "Distributed Brains",
      format: "text/markdown",
      brainDid: "did:web:brain.example.com",
      topics: ["protocols"],
      sourceEntityType: "post",
      sourceEntityId: "post-1",
      publishedAt: "2026-05-28T12:00:00.000Z",
    });
  });

  it("stores the custom ATProto post URI in blog frontmatter after publish", async () => {
    const projection = createBlogAtprotoProjection();
    const entity = createMockPost(
      "post-1",
      "Distributed Brains",
      "distributed-brains",
      "published",
      { publishedAt: "2026-05-28T12:00:00.000Z" },
    );
    const shell = createMockShell();
    shell.addEntities([entity]);
    const context = createServicePluginContext(shell, "blog");
    const record = await projection.buildRecord({
      entity,
      context,
      config: {
        enabled: true,
        pdsEndpoint: "https://bsky.social",
      },
    });

    await projection.onPublished?.({
      entity,
      context,
      record,
      uri: "at://did:plc:repo/ai.rizom.brain.post/abc",
      cid: "cid",
    });

    const updated = await context.entityService.getEntity({
      entityType: "post",
      id: "post-1",
    });

    expect(updated?.content).toContain("atprotoUri:");
    expect(updated?.content).toContain(
      "at://did:plc:repo/ai.rizom.brain.post/abc",
    );
  });

  it("registers the blog projection when the blog plugin registers", async () => {
    const harness = createPluginHarness<BlogPlugin>({
      dataDir: "/tmp/test-blog",
    });

    await harness.installPlugin(new BlogPlugin({}));

    const projection = AtprotoProjectionRegistry.getInstance().get("post");
    expect(projection?.collection).toBe("ai.rizom.brain.post");
  });
});
