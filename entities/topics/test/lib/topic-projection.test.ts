import { describe, expect, it, mock, spyOn } from "bun:test";
import type {
  BaseEntity,
  ContentVisibility,
  EntityPluginContext,
} from "@brains/plugins";
import {
  createEntityPluginContext,
  createMockShell,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { ProgressReporter } from "@brains/utils/progress";
import type { TopicsPluginConfig } from "../../src/schemas/config";
import {
  createTopicProjectionHandler,
  getInitialProjectionJobOptions,
  replaceAllTopics,
  TopicSourceBatchBuffer,
} from "../../src/lib/topic-projection";

const progressReporter = ProgressReporter.from(
  async (): Promise<void> => undefined,
);
if (!progressReporter) {
  throw new Error("Failed to create progress reporter");
}

const config: TopicsPluginConfig = {
  includeEntityTypes: ["post"],
  minRelevanceScore: 0.5,
  mergeSimilarityThreshold: 0.85,
  autoMerge: true,
  extractableStatuses: ["published"],
  enableAutoExtraction: true,
  extractionVisibility: "public",
  sourceChangeBatchDelayMs: 1000,
};

function createTopic(
  id: string,
  visibility: ContentVisibility = "public",
): BaseEntity {
  const now = new Date().toISOString();
  return {
    id,
    entityType: "topic",
    content: `---\ntitle: ${id}\n---\n${id}`,
    contentHash: "hash",
    visibility,
    metadata: {},
    created: now,
    updated: now,
  };
}

describe("topic projection helpers", () => {
  it("returns stable initial projection job options", () => {
    expect(getInitialProjectionJobOptions()).toMatchObject({
      priority: 5,
      source: "topics-plugin",
      deduplication: "coalesce",
      deduplicationKey: "topics-initial-derivation",
      metadata: {
        operationType: "data_processing",
        operationTarget: "topics-initial-derivation",
        pluginId: "topics",
      },
    });
  });

  it("validates projection job data", () => {
    const context = {
      entityService: {
        getEntity: mock(async (): Promise<BaseEntity | null> => null),
      },
    } as unknown as EntityPluginContext;
    const handler = createTopicProjectionHandler({
      context,
      logger: createSilentLogger(),
      config,
      extractAllTopics: mock(async (): Promise<void> => undefined),
      rebuildAllTopics: mock(async (): Promise<void> => undefined),
      sourceBatch: new TopicSourceBatchBuffer(),
      isEntityPublished: () => true,
    });

    expect(handler.validateAndParse({ mode: "derive" })).toEqual({
      mode: "derive",
    });
    expect(handler.validateAndParse({ mode: "rebuild" })).toEqual({
      mode: "rebuild",
    });
    expect(handler.validateAndParse({ mode: "source-batch" })).toEqual({
      mode: "source-batch",
    });
    expect(handler.validateAndParse({ mode: "unknown" })).toBeNull();
  });

  it("dispatches derive and rebuild jobs to projection callbacks", async () => {
    const extractAllTopics = mock(async (): Promise<void> => undefined);
    const rebuildAllTopics = mock(async (): Promise<void> => undefined);
    const context = {
      entityService: {
        getEntity: mock(async (): Promise<BaseEntity | null> => null),
      },
    } as unknown as EntityPluginContext;
    const handler = createTopicProjectionHandler({
      context,
      logger: createSilentLogger(),
      config,
      extractAllTopics,
      rebuildAllTopics,
      sourceBatch: new TopicSourceBatchBuffer(),
      isEntityPublished: () => true,
    });

    const deriveResult = await handler.process(
      { mode: "derive" },
      "derive-job",
      progressReporter,
    );
    const rebuildResult = await handler.process(
      { mode: "rebuild" },
      "rebuild-job",
      progressReporter,
    );

    expect(deriveResult).toEqual({ success: true });
    expect(rebuildResult).toEqual({ success: true });

    expect(extractAllTopics).toHaveBeenCalledTimes(1);
    expect(rebuildAllTopics).toHaveBeenCalledTimes(1);
  });

  it("drains source-change batches and skips stale, missing, and unpublished entities", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const sourceBatch = new TopicSourceBatchBuffer();

    const now = new Date().toISOString();
    mockShell.addEntities([
      {
        id: "fresh-post",
        entityType: "post",
        content: "Fresh published post",
        contentHash: "fresh-hash",
        visibility: "public",
        metadata: { status: "published", title: "Fresh" },
        created: now,
        updated: now,
      },
      {
        id: "stale-post",
        entityType: "post",
        content: "Changed post",
        contentHash: "new-hash",
        visibility: "public",
        metadata: { status: "published", title: "Stale" },
        created: now,
        updated: now,
      },
      {
        id: "draft-post",
        entityType: "post",
        content: "Draft post",
        contentHash: "draft-hash",
        visibility: "public",
        metadata: { status: "draft", title: "Draft" },
        created: now,
        updated: now,
      },
    ]);

    sourceBatch.add({
      entityId: "fresh-post",
      entityType: "post",
      contentHash: "fresh-hash",
    });
    sourceBatch.add({
      entityId: "stale-post",
      entityType: "post",
      contentHash: "old-hash",
    });
    sourceBatch.add({
      entityId: "draft-post",
      entityType: "post",
      contentHash: "draft-hash",
    });
    sourceBatch.add({
      entityId: "missing-post",
      entityType: "post",
      contentHash: "missing-hash",
    });

    spyOn(context.ai, "generate").mockResolvedValue({
      topics: [
        {
          title: "Batch Backpressure",
          content: "Source changes are processed together.",
          relevanceScore: 0.9,
        },
      ],
    });

    const handler = createTopicProjectionHandler({
      context,
      logger,
      config,
      sourceBatch,
      isEntityPublished: (entity) =>
        entity.metadata["status"] === undefined ||
        entity.metadata["status"] === "published",
      extractAllTopics: mock(async (): Promise<void> => undefined),
      rebuildAllTopics: mock(async (): Promise<void> => undefined),
    });

    const result = await handler.process(
      { mode: "source-batch", minRelevanceScore: 0.5 },
      "source-batch-job",
      progressReporter,
    );

    expect(result).toMatchObject({
      success: true,
      sources: 4,
      created: 1,
      skipped: 0,
      batches: 1,
      stale: 1,
      missing: 1,
      unpublished: 1,
    });
    expect(context.ai.generate).toHaveBeenCalledTimes(1);
    expect(sourceBatch.drain()).toEqual([]);
  });

  it("filters source-change extraction by configured visibility scope", async () => {
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    const context = createEntityPluginContext(mockShell, "topics");
    const sourceBatch = new TopicSourceBatchBuffer();
    const now = new Date().toISOString();

    mockShell.addEntities([
      {
        id: "public-post",
        entityType: "post",
        content: "Public source content",
        contentHash: "public-hash",
        visibility: "public",
        metadata: { status: "published", title: "Public" },
        created: now,
        updated: now,
      },
      {
        id: "shared-post",
        entityType: "post",
        content: "Shared source content",
        contentHash: "shared-hash",
        visibility: "shared",
        metadata: { status: "published", title: "Shared" },
        created: now,
        updated: now,
      },
      {
        id: "restricted-post",
        entityType: "post",
        content: "Restricted source content",
        contentHash: "restricted-hash",
        visibility: "restricted",
        metadata: { status: "published", title: "Restricted" },
        created: now,
        updated: now,
      },
    ]);

    sourceBatch.add({
      entityId: "public-post",
      entityType: "post",
      contentHash: "public-hash",
    });
    sourceBatch.add({
      entityId: "shared-post",
      entityType: "post",
      contentHash: "shared-hash",
    });
    sourceBatch.add({
      entityId: "restricted-post",
      entityType: "post",
      contentHash: "restricted-hash",
    });

    const generateSpy = spyOn(context.ai, "generate").mockResolvedValue({
      topics: [
        {
          title: "Visible Sources",
          content: "Only visible sources are extracted.",
          relevanceScore: 0.9,
        },
      ],
    });

    const handler = createTopicProjectionHandler({
      context,
      logger,
      config: { ...config, extractionVisibility: "shared" },
      sourceBatch,
      isEntityPublished: (entity) =>
        entity.metadata["status"] === undefined ||
        entity.metadata["status"] === "published",
      extractAllTopics: mock(async (): Promise<void> => undefined),
      rebuildAllTopics: mock(async (): Promise<void> => undefined),
    });

    const result = await handler.process(
      { mode: "source-batch", minRelevanceScore: 0.5 },
      "source-batch-visibility-job",
      progressReporter,
    );

    expect(result).toMatchObject({
      success: true,
      sources: 3,
      created: 1,
      hidden: 1,
    });
    const generatedPrompt = generateSpy.mock.calls[0]?.[0].prompt ?? "";
    expect(generatedPrompt).toContain("Public source content");
    expect(generatedPrompt).toContain("Shared source content");
    expect(generatedPrompt).not.toContain("Restricted source content");
  });

  it("keeps only the latest content hash for repeated source changes", () => {
    const sourceBatch = new TopicSourceBatchBuffer();

    sourceBatch.add({
      entityId: "post-1",
      entityType: "post",
      contentHash: "old-hash",
    });
    sourceBatch.add({
      entityId: "post-1",
      entityType: "post",
      contentHash: "new-hash",
    });

    expect(sourceBatch.drain()).toEqual([
      {
        entityId: "post-1",
        entityType: "post",
        contentHash: "new-hash",
      },
    ]);
  });

  it("deletes only target-visibility topics when replacing with no entities", async () => {
    const deleteEntity = mock(async (): Promise<boolean> => true);
    const context = {
      entityService: {
        listEntities: mock(
          async (): Promise<BaseEntity[]> => [
            createTopic("topic-a", "public"),
            createTopic("topic-b", "shared"),
            createTopic("topic-c", "restricted"),
          ],
        ),
        deleteEntity,
      },
    } as unknown as EntityPluginContext;

    const result = await replaceAllTopics(
      [],
      context,
      createSilentLogger(),
      config,
    );

    expect(result).toEqual({
      deleted: 1,
      created: 0,
      merged: 0,
      skipped: 0,
      batches: 0,
    });

    expect(deleteEntity).toHaveBeenCalledTimes(1);
    expect(deleteEntity).toHaveBeenCalledWith({
      entityType: "topic",
      id: "topic-a",
    });
  });
});
