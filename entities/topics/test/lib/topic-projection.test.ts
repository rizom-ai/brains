import { describe, expect, it, mock } from "bun:test";
import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { ProgressReporter } from "@brains/utils";
import type { TopicsPluginConfig } from "../../src/schemas/config";
import {
  createTopicProjectionHandler,
  getInitialProjectionJobOptions,
  replaceAllTopics,
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
  enableAutoExtraction: true,
};

function createTopic(id: string): BaseEntity {
  const now = new Date().toISOString();
  return {
    id,
    entityType: "topic",
    content: `---\ntitle: ${id}\n---\n${id}`,
    contentHash: "hash",
    metadata: { aliases: [] },
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
    });

    expect(handler.validateAndParse({ mode: "derive" })).toEqual({
      mode: "derive",
    });
    expect(handler.validateAndParse({ mode: "rebuild" })).toEqual({
      mode: "rebuild",
    });
    expect(
      handler.validateAndParse({
        mode: "source",
        entityId: "post-1",
        entityType: "post",
        minRelevanceScore: 0.7,
      }),
    ).toMatchObject({
      mode: "source",
      entityId: "post-1",
      entityType: "post",
      minRelevanceScore: 0.7,
    });
    expect(handler.validateAndParse({ mode: "source" })).toBeNull();
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

  it("returns an empty extraction result when a source entity is missing", async () => {
    const getEntity = mock(async (): Promise<BaseEntity | null> => null);
    const context = {
      entityService: { getEntity },
    } as unknown as EntityPluginContext;
    const handler = createTopicProjectionHandler({
      context,
      logger: createSilentLogger(),
      config,
      extractAllTopics: mock(async (): Promise<void> => undefined),
      rebuildAllTopics: mock(async (): Promise<void> => undefined),
    });

    const result = await handler.process(
      {
        mode: "source",
        entityId: "missing-post",
        entityType: "post",
      },
      "source-job",
      progressReporter,
    );

    expect(result).toEqual({ success: false, topicsExtracted: 0 });
    expect(getEntity).toHaveBeenCalledWith("post", "missing-post");
  });

  it("deletes existing topics without extraction when replacing with no entities", async () => {
    const deleteEntity = mock(async (): Promise<boolean> => true);
    const context = {
      entityService: {
        listEntities: mock(
          async (): Promise<BaseEntity[]> => [
            createTopic("topic-a"),
            createTopic("topic-b"),
          ],
        ),
        deleteEntity,
      },
    } as unknown as EntityPluginContext;

    const result = await replaceAllTopics([], context, createSilentLogger());

    expect(result).toEqual({
      deleted: 2,
      created: 0,
      skipped: 0,
      batches: 0,
    });

    expect(deleteEntity).toHaveBeenCalledWith("topic", "topic-a");
    expect(deleteEntity).toHaveBeenCalledWith("topic", "topic-b");
  });
});
