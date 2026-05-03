import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "@brains/utils";
import {
  createMockShell,
  createServicePluginContext,
  type MockShell,
  type ServicePluginContext,
} from "@brains/plugins/test";
import type { BaseEntity } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import type { PublishableMetadata } from "../../src/schemas/publishable";
import { preparePublishContent } from "../../src/tools/publish-content";

function createPublishableEntity(
  content: string,
): BaseEntity<PublishableMetadata> {
  return {
    id: "post-1",
    entityType: "social-post",
    content,
    contentHash: "test",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    metadata: { status: "draft" },
  };
}

describe("preparePublishContent", () => {
  let context: ServicePluginContext;
  let mockShell: MockShell;

  beforeEach(() => {
    mockShell = createMockShell({ logger: createSilentLogger() });
    context = createServicePluginContext(mockShell, "content-pipeline");
    mockShell
      .getEntityRegistry()
      .registerEntityType("image", z.any(), {} as never);
  });

  it("should strip markdown frontmatter", async () => {
    const content = `---
title: Test Post
status: draft
---
This is the body.`;

    const result = await preparePublishContent(
      context,
      createPublishableEntity(content),
    );

    expect(result.bodyContent).toBe("This is the body.");
    expect(result.imageData).toBeUndefined();
  });

  it("should fetch image data when coverImageId is present", async () => {
    await context.entityService.createEntity({
      id: "cover-image",
      entityType: "image",
      content: "data:image/png;base64,aGVsbG8=",
      metadata: {},
    });

    const content = `---
coverImageId: cover-image
---
Post with image.`;

    const result = await preparePublishContent(
      context,
      createPublishableEntity(content),
    );

    expect(result.bodyContent).toBe("Post with image.");
    expect(result.imageData?.mimeType).toBe("image/png");
    expect(result.imageData?.data.toString("utf8")).toBe("hello");
  });

  it("should ignore missing or invalid image data", async () => {
    await context.entityService.createEntity({
      id: "invalid-image",
      entityType: "image",
      content: "not-a-data-url",
      metadata: {},
    });

    const content = `---
coverImageId: invalid-image
---
Post without usable image.`;

    const result = await preparePublishContent(
      context,
      createPublishableEntity(content),
    );

    expect(result.bodyContent).toBe("Post without usable image.");
    expect(result.imageData).toBeUndefined();
  });
});
