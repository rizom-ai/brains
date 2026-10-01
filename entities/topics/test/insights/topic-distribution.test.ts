import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  createTopicDistributionInsight,
  type TopicDistributionEntry,
} from "../../src/insights/topic-distribution";
import type { BaseEntity, ContentVisibility } from "@brains/plugins";

import { TopicAdapter } from "../../src/lib/topic-adapter";

const topicDistributionSchema = z.array(
  z.object({ topic: z.string(), title: z.string() }),
);

const adapter = new TopicAdapter();

/**
 * Fixed timestamps rather than `new Date()`: listings default to `updated`
 * descending, so wall-clock stamps make the expected order depend on whether
 * the clock ticked between two fixtures.
 */
function makeTopicEntity(
  id: string,
  title: string,
  visibility: ContentVisibility = "public",
  updated = "2026-01-01T00:00:00.000Z",
): BaseEntity {
  const content = adapter.createTopicBody({ title, content: "" });
  return {
    id,
    entityType: "topic",
    content,
    contentHash: "x",
    visibility,
    metadata: {},
    created: updated,
    updated,
  };
}

function makeNote(
  id: string,
  visibility: ContentVisibility = "public",
  status = "published",
): BaseEntity {
  return {
    id,
    entityType: "note",
    content: `Body of ${id}.`,
    contentHash: `hash-${id}`,
    visibility,
    metadata: { status },
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

const options = {
  isSourceType: (type: string): boolean => type !== "topic",
  autoExtraction: true,
};

const unextractedSchema = z.object({
  sourceEntities: z.number(),
  hint: z.string(),
});

function topicShell(topics: BaseEntity[]): MockShell {
  const shell = createMockShell();
  shell.addEntities(topics);
  return shell;
}

function getTopicDistribution(
  result: Record<string, unknown>,
): TopicDistributionEntry[] {
  return topicDistributionSchema.parse(result["topics"]);
}

describe("topic-distribution insight", () => {
  it("should return topics with titles", async () => {
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      makeTopicEntity("typescript", "TypeScript"),
    ]);

    const handler = createTopicDistributionInsight(options);
    const result = await handler(shell.getEntityService(), "public");

    expect(getTopicDistribution(result)).toEqual([
      { topic: "education", title: "Education" },
      { topic: "typescript", title: "TypeScript" },
    ]);
  });

  it("should return empty when no visible topics exist", async () => {
    // A restricted topic registers the type but stays outside public scope.
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
    ]);

    const handler = createTopicDistributionInsight(options);
    const result = await handler(shell.getEntityService(), "public");

    expect(getTopicDistribution(result)).toEqual([]);
  });

  it("should scope topic listing to the caller visibility", async () => {
    const shell = topicShell([
      makeTopicEntity("public-topic", "Public Topic", "public"),
      makeTopicEntity("shared-topic", "Shared Topic", "shared"),
      makeTopicEntity("restricted-topic", "Restricted Topic", "restricted"),
    ]);
    const handler = createTopicDistributionInsight(options);

    const sharedResult = await handler(shell.getEntityService(), "shared");
    expect(
      getTopicDistribution(sharedResult).map((entry) => entry.topic),
    ).toEqual(["public-topic", "shared-topic"]);

    const publicResult = await handler(shell.getEntityService(), "public");
    expect(
      getTopicDistribution(publicResult).map((entry) => entry.topic),
    ).toEqual(["public-topic"]);
  });

  it("should return empty when topic entity type is not registered", async () => {
    const handler = createTopicDistributionInsight(options);
    const result = await handler(
      createMockShell().getEntityService(),
      "public",
    );

    expect(getTopicDistribution(result)).toEqual([]);
  });

  it("says topics are not extracted yet when visible content exists", async () => {
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("public-note"),
      makeNote("other-public-note"),
      makeNote("private-note", "restricted"),
    ]);

    const result = await createTopicDistributionInsight(options)(
      shell.getEntityService(),
      "public",
    );

    expect(getTopicDistribution(result)).toEqual([]);
    const unextracted = unextractedSchema.parse(result["unextracted"]);
    expect(unextracted.sourceEntities).toBe(2);
    expect(unextracted.hint).toContain("not been extracted yet");
    expect(unextracted.hint).toContain("system_search");
  });

  it("counts no drafts for a public caller, as search does not", async () => {
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("public-draft", "public", "draft"),
    ]);

    const publicResult = await createTopicDistributionInsight(options)(
      shell.getEntityService(),
      "public",
    );
    expect(publicResult).toEqual({ topics: [] });

    const sharedResult = await createTopicDistributionInsight(options)(
      shell.getEntityService(),
      "shared",
    );
    expect(
      unextractedSchema.parse(sharedResult["unextracted"]).sourceEntities,
    ).toBe(1);
  });

  it("says extraction is off when automatic extraction is disabled", async () => {
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("public-note"),
    ]);

    const result = await createTopicDistributionInsight({
      ...options,
      autoExtraction: false,
    })(shell.getEntityService(), "public");

    const unextracted = unextractedSchema.parse(result["unextracted"]);
    expect(unextracted.hint).toContain("extraction is off");
    expect(unextracted.hint).toContain("system_search");
  });

  it("counts only types topics are extracted from", async () => {
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("public-note"),
    ]);

    const result = await createTopicDistributionInsight({
      ...options,
      isSourceType: (type) => type === "post",
    })(shell.getEntityService(), "public");

    expect(result).toEqual({ topics: [] });
  });

  it("adds nothing when topics exist", async () => {
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      makeNote("public-note"),
    ]);

    const result = await createTopicDistributionInsight(options)(
      shell.getEntityService(),
      "public",
    );

    expect(result["unextracted"]).toBeUndefined();
  });
});
