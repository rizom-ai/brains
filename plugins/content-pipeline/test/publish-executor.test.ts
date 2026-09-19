import { describe, expect, it, mock } from "bun:test";
import assert from "node:assert/strict";
import { z } from "@brains/utils/zod";
import {
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import { ProviderRegistry } from "../src/provider-registry";
import { PublishExecutor } from "../src/publish-executor";

describe("PublishExecutor", () => {
  it("publishes and saves state inside the content scope before cleanup, without replay after cleanup failure", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "post",
        baseEntitySchema.partial().passthrough(),
        createTestEntityAdapter("post"),
      );
    const context = createServicePluginContext(shell, "content-pipeline");
    await context.entityService.createEntity({
      entity: {
        id: "scoped",
        entityType: "post",
        visibility: "public",
        content: "---\nstatus: draft\n---\nBody",
        metadata: { status: "draft" },
      },
    });
    const providerRegistry = ProviderRegistry.createFresh();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let scopeOpen = false;
    const publish = mock(async () => {
      expect(scopeOpen).toBe(true);
      entered.resolve();
      await release.promise;
      expect(scopeOpen).toBe(true);
      return { id: "remote-post" };
    });
    providerRegistry.register("post", { name: "fixture", publish });
    const cleanup = new Error("content cleanup failed after publication");
    const executor = new PublishExecutor({
      context,
      providerRegistry,
      withPublishContent: async (
        scopedContext,
        entity,
        use,
      ): Promise<never> => {
        scopeOpen = true;
        try {
          await use({ bodyContent: "Body" });
          const saved = await scopedContext.entityService.getEntity({
            entityType: entity.entityType,
            id: entity.id,
          });
          expect(saved?.metadata["status"]).toBe("published");
          expect(saved?.metadata["platformId"]).toBe("remote-post");
          throw cleanup;
        } finally {
          scopeOpen = false;
        }
      },
    });
    const work = executor.publish({ entityType: "post", id: "scoped" });
    const rejected = assert.rejects(
      work,
      (error: unknown) => error === cleanup,
    );
    try {
      await entered.promise;
      expect(scopeOpen).toBe(true);
    } finally {
      release.resolve();
    }
    await rejected;
    expect(scopeOpen).toBe(false);
    expect(
      await executor.publish({ entityType: "post", id: "scoped" }),
    ).toEqual({ error: "Entity is already published" });
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it("stores configured provider result ID field", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "social-post",
        baseEntitySchema.partial().passthrough(),
        createTestEntityAdapter("social-post"),
      );
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

  it("preserves an existing publishedAt when republishing a draft", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType("post", z.any(), createTestEntityAdapter("post"));
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
publishedAt: '2025-01-03T10:00:00.000Z'
---
Body`,
        metadata: {
          status: "draft",
          slug: "post-1",
          publishedAt: "2025-01-03T10:00:00.000Z",
        },
      },
    });
    const executor = new PublishExecutor({ context, providerRegistry });

    const result = await executor.publish({ entityType: "post", id: "post-1" });

    expect("error" in result).toBe(false);
    const updated = await context.entityService.getEntity({
      entityType: "post",
      id: "post-1",
    });
    expect(updated?.metadata["publishedAt"]).toBe("2025-01-03T10:00:00.000Z");
    expect(updated?.content).toContain(
      "publishedAt: '2025-01-03T10:00:00.000Z'",
    );
  });

  it("runs publish asset preflight after publish state is updated", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "post",
        baseEntitySchema.partial().passthrough(),
        createTestEntityAdapter("post"),
      );
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
