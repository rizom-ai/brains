import { describe, expect, it, mock } from "bun:test";
import { executeWithProvider } from "../src/scheduler-publish";
import { ProviderRegistry } from "../src/provider-registry";
import { RetryTracker } from "../src/retry-tracker";
import type { QueueEntry } from "../src/queue-manager";
import { SYSTEM_PUBLISH_AUTH_CONTEXT } from "../src/types/messages";

function createEntry(): QueueEntry {
  return {
    entityType: "post",
    entityId: "post-1",
    position: 1,
    queuedAt: "2026-06-04T12:00:00.000Z",
    authContext: SYSTEM_PUBLISH_AUTH_CONTEXT,
  };
}

describe("scheduler publish execution", () => {
  it("uses the shared publish executor when provided", async () => {
    const providerRegistry = ProviderRegistry.createFresh();
    const providerPublish = mock(async () => ({ id: "provider-result" }));
    providerRegistry.register("post", {
      name: "test",
      publish: providerPublish,
    });
    const retryTracker = RetryTracker.createFresh({
      maxRetries: 3,
      baseDelayMs: 10,
    });
    const onPublish = mock(() => {});
    const publish = mock(async () => ({
      entity: {
        id: "post-1",
        entityType: "post",
        content: "Body",
        visibility: "public" as const,
        metadata: { status: "published" as const },
        created: "2026-06-04T12:00:00.000Z",
        updated: "2026-06-04T12:00:00.000Z",
        contentHash: "hash",
      },
      result: { id: "executor-result" },
    }));

    await executeWithProvider(createEntry(), {
      providerRegistry,
      retryTracker,
      publishExecutor: { publish },
      onPublish,
    });

    expect(publish).toHaveBeenCalledWith({ entityType: "post", id: "post-1" });
    expect(providerPublish).not.toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalledWith({
      entityType: "post",
      entityId: "post-1",
      result: { id: "executor-result" },
    });
  });

  it("reports publish executor validation errors without retrying", async () => {
    const providerRegistry = ProviderRegistry.createFresh();
    const retryTracker = RetryTracker.createFresh({
      maxRetries: 3,
      baseDelayMs: 10,
    });
    const onFailed = mock(() => {});

    await executeWithProvider(createEntry(), {
      providerRegistry,
      retryTracker,
      publishExecutor: {
        publish: mock(async () => ({ error: "Entity is already published" })),
      },
      onFailed,
    });

    expect(onFailed).toHaveBeenCalledWith({
      entityType: "post",
      entityId: "post-1",
      error: "Entity is already published",
      retryCount: 0,
      willRetry: false,
    });
    expect(retryTracker.getRetryInfo("post-1")).toBeNull();
  });
});
