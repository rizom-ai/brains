import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { SystemPlugin } from "../src/plugin";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
  expectConfirmation,
} from "@brains/plugins/test";
import { createTestEntity } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";

describe("entity_delete tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    await harness.installPlugin(new SystemPlugin());
  });

  afterEach(() => {
    harness.reset();
  });

  it("should return confirmation prompt with title and preview", async () => {
    const entity = createTestEntity<BaseEntity>("post", {
      id: "my-post",
      content:
        "---\ntitle: My Post\nstatus: draft\n---\nThis is the post body content.",
      metadata: { title: "My Post", status: "draft", slug: "my-post" },
    });
    await harness.getEntityService().upsertEntity(entity);

    const result = await harness.executeTool("system_delete", {
      entityType: "post",
      id: "my-post",
    });

    expectConfirmation(result);
    expect(result.toolName).toBe("system_delete");
    expect(result.description).toContain("My Post");
  });

  it("should delete entity when called with confirmed args", async () => {
    const entity = createTestEntity<BaseEntity>("post", {
      id: "my-post",
      content:
        "---\ntitle: My Post\nstatus: draft\n---\nThis is the post body.",
      metadata: { title: "My Post", status: "draft", slug: "my-post" },
    });
    await harness.getEntityService().upsertEntity(entity);

    const result = await harness.executeTool("system_delete", {
      entityType: "post",
      id: "my-post",
      confirmed: true,
    });

    expectSuccess(result);

    const fetched = await harness
      .getEntityService()
      .getEntity("post", "my-post");
    expect(fetched).toBeNull();
  });

  it("should delete published entity after confirmation", async () => {
    const entity = createTestEntity<BaseEntity>("post", {
      id: "published-post",
      content:
        "---\ntitle: Published Post\nstatus: published\n---\nPublished content.",
      metadata: {
        title: "Published Post",
        status: "published",
        slug: "published-post",
      },
    });
    await harness.getEntityService().upsertEntity(entity);

    const result = await harness.executeTool("system_delete", {
      entityType: "post",
      id: "published-post",
      confirmed: true,
    });

    expectSuccess(result);
    const fetched = await harness
      .getEntityService()
      .getEntity("post", "published-post");
    expect(fetched).toBeNull();
  });

  it("should return error for nonexistent entity", async () => {
    const result = await harness.executeTool("system_delete", {
      entityType: "post",
      id: "no-such-post",
    });

    expectError(result);
    expect(result.error).toContain("not found");
  });

  it("should not delete entity on first call (confirmation only)", async () => {
    const entity = createTestEntity<BaseEntity>("post", {
      id: "keep-me",
      content: "---\ntitle: Keep Me\nstatus: draft\n---\nDo not delete.",
      metadata: { title: "Keep Me", status: "draft", slug: "keep-me" },
    });
    await harness.getEntityService().upsertEntity(entity);

    // First call — should only return confirmation, not delete
    await harness.executeTool("system_delete", {
      entityType: "post",
      id: "keep-me",
    });

    const fetched = await harness
      .getEntityService()
      .getEntity("post", "keep-me");
    expect(fetched).not.toBeNull();
  });
});
