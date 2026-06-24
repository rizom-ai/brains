import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import { ProviderRegistry } from "../src/provider-registry";
import { PublishExecutor } from "../src/publish-executor";

describe("PublishExecutor", () => {
  it("stores configured provider result ID field", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType("social-post", z.any(), {} as never);
    const context = createServicePluginContext(shell, "content-pipeline");
    const providerRegistry = ProviderRegistry.createFresh();
    providerRegistry.register(
      "social-post",
      {
        name: "linkedin",
        publish: mock(async () => ({ id: "urn:li:share:123" })),
      },
      { publishResultIdField: "platformPostId" },
    );
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        visibility: "public",
        content: `---
title: Test Post
status: draft
platform: linkedin
---
Body`,
        metadata: { status: "draft", platform: "linkedin" },
      },
    });
    const executor = new PublishExecutor({ context, providerRegistry });

    const result = await executor.publish({
      entityType: "social-post",
      id: "post-1",
    });

    expect("error" in result).toBe(false);
    const updated = await context.entityService.getEntity({
      entityType: "social-post",
      id: "post-1",
    });
    expect(updated?.metadata["platformId"]).toBe("urn:li:share:123");
    expect(updated?.metadata["platformPostId"]).toBe("urn:li:share:123");
    expect(updated?.content).toContain("platformPostId: 'urn:li:share:123'");
  });

  it("runs publish asset preflight after publish state is updated", async () => {
    const shell = createMockShell();
    shell.getEntityRegistry().registerEntityType("post", z.any(), {} as never);
    const context = createServicePluginContext(shell, "content-pipeline");
    const providerRegistry = ProviderRegistry.createFresh();
    providerRegistry.register("post", {
      name: "internal",
      publish: mock(async () => ({ id: "post-1" })),
    });
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "post",
        visibility: "public",
        content: `---
title: Test Post
status: draft
---
Body`,
        metadata: { status: "draft", slug: "post-1" },
      },
    });
    const ensureForEntity = mock(async () => undefined);
    const executor = new PublishExecutor({
      context,
      providerRegistry,
      publishAssetPreflight: { ensureForEntity },
    });

    const result = await executor.publish({ entityType: "post", id: "post-1" });

    expect("error" in result).toBe(false);
    expect(ensureForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "post-1",
        metadata: expect.objectContaining({ status: "published" }),
        content: expect.stringContaining("status: published"),
      }),
    );
  });
});
