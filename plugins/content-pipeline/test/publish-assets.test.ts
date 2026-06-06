import { describe, expect, it } from "bun:test";
import {
  PublishAssetRegistry,
  publishAssetDefinitionSchema,
} from "../src/publish-assets";

describe("PublishAssetRegistry", () => {
  it("stores and unregisters publish asset definitions", () => {
    const registry = PublishAssetRegistry.createFresh();
    const unregister = registry.register({
      entityType: "post",
      attachmentType: "og-image",
      mediaEntityType: "image",
      targetEntityField: { location: "frontmatter", field: "ogImageId" },
      requiredWhen: { status: "published" },
      autoGenerate: true,
      jobType: "image:image-render-source",
    });

    expect(registry.has("post", "og-image")).toBe(true);
    expect(registry.get("post", "og-image")).toMatchObject({
      entityType: "post",
      attachmentType: "og-image",
      mediaEntityType: "image",
    });
    expect(registry.list("post")).toHaveLength(1);

    unregister();

    expect(registry.has("post", "og-image")).toBe(false);
  });

  it("validates required definition fields", () => {
    expect(
      publishAssetDefinitionSchema.safeParse({
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
      }).success,
    ).toBe(true);

    expect(
      publishAssetDefinitionSchema.safeParse({
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "video",
      }).success,
    ).toBe(false);
  });
});
