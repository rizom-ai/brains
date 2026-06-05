import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import { ProviderRegistry } from "../src/provider-registry";
import { PublishExecutor } from "../src/publish-executor";

describe("PublishExecutor", () => {
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
