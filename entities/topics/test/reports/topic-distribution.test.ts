import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  createTopicDistributionReport,
  type TopicDistributionEntry,
} from "../../src/reports/topic-distribution";
import type { BaseEntity, ContentVisibility } from "@brains/plugins";
import { generateIdFromText } from "@brains/utils/string-utils";

import { TopicAdapter } from "../../src/lib/topic-adapter";
import { countTopicSources } from "../../src/lib/topic-source-counts";
import { isTopicSourceEligible } from "../../src/lib/topic-source-policy";
import {
  topicsPluginConfigSchema,
  type TopicsPluginConfig,
} from "../../src/schemas/config";
import type { TopicVote } from "../../src/schemas/votes";

const topicDistributionSchema = z.array(
  z.object({ topic: z.string(), title: z.string(), sources: z.number() }),
);

const coverageSchema = z.object({
  sourceEntities: z.number(),
  attributed: z.number(),
  unattributed: z.number(),
});

const PROMPT = "votes-prompt";
const config = topicsPluginConfigSchema.parse({});

const adapter = new TopicAdapter();

/** The report's handler, called as the registry calls it. */
function runReport(
  options: Parameters<typeof createTopicDistributionReport>[0],
): (
  entityService: ReturnType<MockShell["getEntityService"]>,
  visibilityScope: ContentVisibility,
) => Promise<Record<string, unknown>> {
  const report = createTopicDistributionReport(options);
  return (entityService, visibilityScope) =>
    report.handler({}, { entityService, visibilityScope });
}

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

/** A fresh vote by this source for each title, at full relevance. */
function vote(source: BaseEntity, ...titles: string[]): [string, TopicVote] {
  return [
    `${source.entityType}:${source.id}`,
    {
      contentHash: source.contentHash,
      promptVersion: PROMPT,
      visibility: "public",
      supported: titles.map((title) => ({
        slug: generateIdFromText(title),
        title,
        relevanceScore: 1,
      })),
      proposal: null,
    },
  ];
}

/** The vote as cast under another extraction visibility. */
function stampedAt(
  visibility: TopicVote["visibility"],
  [key, cast]: [string, TopicVote],
): [string, TopicVote] {
  return [key, { ...cast, visibility }];
}

/**
 * The report wired as the plugin wires it: extraction's eligibility rule,
 * and counts read from these votes under this extraction config.
 */
function extractionOptions(
  votes: [string, TopicVote][] = [],
  extraction: TopicsPluginConfig = config,
): Parameters<typeof createTopicDistributionReport>[0] {
  return {
    isSourceType: (type: string): boolean => type !== "topic",
    isEligibleSource: (entity) => isTopicSourceEligible(entity, extraction),
    autoExtraction: true,
    countSources: async (sources) =>
      countTopicSources({
        sources,
        votes: new Map(votes),
        aliases: new Map(),
        promptVersion: PROMPT,
        config: extraction,
      }),
  };
}

const options = extractionOptions();

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

describe("topic-distribution report", () => {
  it("should return topics with titles", async () => {
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      makeTopicEntity("typescript", "TypeScript"),
    ]);

    const handler = runReport(options);
    const result = await handler(shell.getEntityService(), "public");

    expect(getTopicDistribution(result)).toEqual([
      { topic: "education", title: "Education", sources: 0 },
      { topic: "typescript", title: "TypeScript", sources: 0 },
    ]);
  });

  it("counts the sources supporting each topic, most supported first", async () => {
    const first = makeNote("first");
    const second = makeNote("second");
    const third = makeNote("third");
    const shell = topicShell([
      makeTopicEntity("zoology", "Zoology"),
      makeTopicEntity("education", "Education"),
      makeTopicEntity("art", "Art"),
      makeTopicEntity("typescript", "TypeScript"),
      first,
      second,
      third,
    ]);

    const result = await runReport(
      extractionOptions([
        vote(first, "TypeScript", "Education"),
        vote(second, "TypeScript"),
        vote(third),
      ]),
    )(shell.getEntityService(), "public");

    expect(getTopicDistribution(result)).toEqual([
      { topic: "typescript", title: "TypeScript", sources: 2 },
      { topic: "education", title: "Education", sources: 1 },
      { topic: "art", title: "Art", sources: 0 },
      { topic: "zoology", title: "Zoology", sources: 0 },
    ]);
  });

  it("counts only public published sources for a public caller", async () => {
    const extraction = topicsPluginConfigSchema.parse({
      extractionVisibility: "shared",
      extractableStatuses: ["published", "draft"],
    });
    const published = makeNote("published");
    const draft = makeNote("draft", "public", "draft");
    const shared = makeNote("shared", "shared");
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      published,
      draft,
      shared,
    ]);
    const report = runReport(
      extractionOptions(
        [published, draft, shared].map((note) =>
          stampedAt("shared", vote(note, "Education")),
        ),
        extraction,
      ),
    );

    const publicResult = await report(shell.getEntityService(), "public");
    expect(getTopicDistribution(publicResult)[0]?.sources).toBe(1);
    expect(coverageSchema.parse(publicResult["coverage"])).toEqual({
      sourceEntities: 1,
      attributed: 1,
      unattributed: 0,
    });

    const sharedResult = await report(shell.getEntityService(), "shared");
    expect(getTopicDistribution(sharedResult)[0]?.sources).toBe(3);
    expect(coverageSchema.parse(sharedResult["coverage"]).sourceEntities).toBe(
      3,
    );
  });

  it("leaves sources extraction never reads out of a wider caller's coverage", async () => {
    const published = makeNote("published");
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      published,
      makeNote("shared", "shared"),
      makeNote("restricted", "restricted"),
    ]);

    const result = await runReport(
      extractionOptions([vote(published, "Education")]),
    )(shell.getEntityService(), "restricted");

    expect(coverageSchema.parse(result["coverage"])).toEqual({
      sourceEntities: 1,
      attributed: 1,
      unattributed: 0,
    });
  });

  it("counts drafts in coverage only when extraction reads drafts", async () => {
    const published = makeNote("published");
    const draft = makeNote("draft", "public", "draft");
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      published,
      draft,
    ]);
    const votes = [vote(published, "Education")];

    const publishedOnly = await runReport(extractionOptions(votes))(
      shell.getEntityService(),
      "shared",
    );
    expect(coverageSchema.parse(publishedOnly["coverage"])).toEqual({
      sourceEntities: 1,
      attributed: 1,
      unattributed: 0,
    });

    const withDrafts = await runReport(
      extractionOptions(
        votes,
        topicsPluginConfigSchema.parse({
          extractableStatuses: ["published", "draft"],
        }),
      ),
    )(shell.getEntityService(), "shared");
    expect(coverageSchema.parse(withDrafts["coverage"])).toEqual({
      sourceEntities: 2,
      attributed: 1,
      unattributed: 1,
    });
  });

  it("counts a read source that supports no listed topic as attributed", async () => {
    const read = makeNote("read");
    const shell = topicShell([makeTopicEntity("education", "Education"), read]);

    const result = await runReport(extractionOptions([vote(read, "Zoology")]))(
      shell.getEntityService(),
      "public",
    );

    expect(getTopicDistribution(result)[0]?.sources).toBe(0);
    expect(coverageSchema.parse(result["coverage"])).toEqual({
      sourceEntities: 1,
      attributed: 1,
      unattributed: 0,
    });
  });

  it("reports how many eligible sources extraction has read", async () => {
    const read = makeNote("read");
    const edited = makeNote("edited");
    const unread = makeNote("unread");
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      read,
      edited,
      unread,
    ]);

    const result = await runReport(
      extractionOptions([
        vote(read, "Education"),
        vote({ ...edited, contentHash: "before-the-edit" }, "Education"),
      ]),
    )(shell.getEntityService(), "public");

    expect(getTopicDistribution(result)[0]?.sources).toBe(1);
    expect(coverageSchema.parse(result["coverage"])).toEqual({
      sourceEntities: 3,
      attributed: 1,
      unattributed: 2,
    });
  });

  it("counts every visible source, across pages", async () => {
    const notes = Array.from({ length: 101 }, (_, index) =>
      makeNote(`note-${String(index).padStart(3, "0")}`),
    );
    const shell = topicShell([
      makeTopicEntity("education", "Education"),
      ...notes,
    ]);

    const result = await runReport(
      extractionOptions(notes.map((note) => vote(note, "Education"))),
    )(shell.getEntityService(), "public");

    expect(getTopicDistribution(result)[0]?.sources).toBe(101);
    expect(coverageSchema.parse(result["coverage"]).sourceEntities).toBe(101);
  });

  it("should return empty when no visible topics exist", async () => {
    // A restricted topic registers the type but stays outside public scope.
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
    ]);

    const handler = runReport(options);
    const result = await handler(shell.getEntityService(), "public");

    expect(getTopicDistribution(result)).toEqual([]);
  });

  it("should scope topic listing to the caller visibility", async () => {
    const shell = topicShell([
      makeTopicEntity("public-topic", "Public Topic", "public"),
      makeTopicEntity("shared-topic", "Shared Topic", "shared"),
      makeTopicEntity("restricted-topic", "Restricted Topic", "restricted"),
    ]);
    const handler = runReport(options);

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
    const handler = runReport(options);
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

    const result = await runReport(options)(shell.getEntityService(), "public");

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
    const draftsExtracted = extractionOptions(
      [],
      topicsPluginConfigSchema.parse({
        extractableStatuses: ["published", "draft"],
      }),
    );

    const publicResult = await runReport(draftsExtracted)(
      shell.getEntityService(),
      "public",
    );
    expect(publicResult).toEqual({ topics: [] });

    const sharedResult = await runReport(draftsExtracted)(
      shell.getEntityService(),
      "shared",
    );
    expect(
      unextractedSchema.parse(sharedResult["unextracted"]).sourceEntities,
    ).toBe(1);
  });

  it("counts only sources extraction reads as not extracted yet", async () => {
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("public-note"),
      makeNote("shared-note", "shared"),
      makeNote("public-draft", "public", "draft"),
    ]);

    const result = await runReport(options)(shell.getEntityService(), "shared");

    expect(unextractedSchema.parse(result["unextracted"]).sourceEntities).toBe(
      1,
    );
    expect(result["outsideExtraction"]).toBeUndefined();
  });

  it("points to search, not extraction, when no visible content is extracted from", async () => {
    // Extraction reads public, published sources: this caller sees only others.
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("shared-note", "shared"),
      makeNote("public-draft", "public", "draft"),
    ]);

    const result = await runReport(options)(shell.getEntityService(), "shared");

    expect(getTopicDistribution(result)).toEqual([]);
    expect(result["unextracted"]).toBeUndefined();
    const outside = unextractedSchema.parse(result["outsideExtraction"]);
    expect(outside.sourceEntities).toBe(2);
    expect(outside.hint).toContain("not drawn from the content visible here");
    expect(outside.hint).not.toContain("extracted yet");
    expect(outside.hint).toContain("system_search");
  });

  it("returns only an empty list when no content is visible", async () => {
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("private-note", "restricted"),
    ]);

    const result = await runReport(options)(shell.getEntityService(), "shared");

    expect(result).toEqual({ topics: [] });
  });

  it("says extraction is off when automatic extraction is disabled", async () => {
    const shell = topicShell([
      makeTopicEntity("private-topic", "Private Topic", "restricted"),
      makeNote("public-note"),
    ]);

    const result = await runReport({
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

    const result = await runReport({
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

    const result = await runReport(options)(shell.getEntityService(), "public");

    expect(result["unextracted"]).toBeUndefined();
  });
});
