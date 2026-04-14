import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ImagePlugin } from "../src/image-plugin";
import { createPluginHarness } from "@brains/plugins/test";

describe("ImagePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: ImagePlugin;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-image" });
    plugin = new ImagePlugin();
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("should register as entity plugin", () => {
    expect(plugin.id).toBe("image");
    expect(plugin.type).toBe("entity");
  });

  it("should register image entity type", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("image");
  });

  it("should return zero tools", async () => {
    const capabilities = await harness.installPlugin(plugin);
    expect(capabilities.tools).toHaveLength(0);
  });

  it("should register a create interceptor for image", () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    expect(interceptor).toBeDefined();
  });

  it("should rewrite image target ids to canonical ids via interceptor", async () => {
    harness.addEntities([
      {
        id: "my-blog-post",
        entityType: "post",
        content: "---\ntitle: My Blog Post\nslug: my-blog-post\n---\nContent",
        metadata: { title: "My Blog Post", slug: "my-blog-post" },
      },
    ]);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        prompt: "Generate a cover image",
        targetEntityType: "post",
        targetEntityId: "My Blog Post",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toEqual({
      kind: "continue",
      input: {
        entityType: "image",
        prompt: "Generate a cover image",
        targetEntityType: "post",
        targetEntityId: "my-blog-post",
      },
    });
  });

  it("should return sync error when image target is missing", async () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        prompt: "Generate a cover image",
        targetEntityType: "post",
        targetEntityId: "missing-post",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Target entity not found: post/missing-post",
      },
    });
  });
});
