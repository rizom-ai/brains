import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SHELL_CHANNELS } from "@brains/plugins";
import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { computeContentHash } from "@brains/utils/hash";
import type { TopicsPluginConfig } from "../schemas/config";
import { TopicExtractor, type ExtractedTopic } from "./topic-extractor";
import { extractTopicsBatched } from "./topic-batch-extractor";
import { TOPIC_ENTITY_TYPE } from "./constants";
import {
  toTopicContentProjection,
  toTopicContentProjectionWithMetadata,
} from "./topic-presenter";
import { replaceAllTopics } from "./topic-projection";
import { TopicService } from "./topic-service";
import { TopicAdapter } from "./topic-adapter";
import { reconcileTopics } from "./topic-reconciliation";
import type { TopicEntity } from "../types";

const entityInputSchema = z.object({
  entityType: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type EntityInput = z.output<typeof entityInputSchema>;

const extractInputSchema = entityInputSchema.extend({
  minRelevanceScore: z.number().optional(),
});

const mergeTestInputSchema = z.object({
  contentA: entityInputSchema,
  contentB: entityInputSchema,
  minRelevanceScore: z.number().optional(),
  threshold: z.number().min(0).max(1).optional(),
});

const detectionTopicSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  content: z.string(),
});

const detectMergeCandidateSchema = z.object({
  existingTopics: z.array(detectionTopicSchema),
  incomingTopic: detectionTopicSchema,
  threshold: z.number().optional(),
});

const mergeProcessingSchema = z.object({
  existingTopics: z.array(detectionTopicSchema).default([]),
  incomingTopic: detectionTopicSchema.extend({
    relevanceScore: z.number().min(0).max(1).optional(),
  }),
  threshold: z.number().optional(),
});

const sequentialInputSchema = z.object({
  entities: z.array(entityInputSchema).min(1),
  minRelevanceScore: z.number().optional(),
});

const rebuildTopicsSchema = z.object({
  existingTopics: z.array(detectionTopicSchema).optional(),
  entities: z.array(entityInputSchema),
});

const reconcileExistingTopicsSchema = z.object({
  existingTopics: z.array(detectionTopicSchema).min(2),
  threshold: z.number().optional(),
  maxPairs: z.number().int().min(0).optional(),
});

const corpusFixtureEntitySchema = entityInputSchema.extend({
  id: z.string(),
});

const corpusFixtureSchema = z.object({
  entities: z.array(corpusFixtureEntitySchema).min(1),
});

const corpusAcceptanceSchema = z.object({
  fixture: z.string(),
  minTopicCount: z.number().int().min(0).default(5),
  maxTopicCount: z.number().int().min(0).default(14),
  requiredTitleMatches: z.array(z.string()).default([]),
  forbiddenTitleMatches: z.array(z.string()).default([]),
  forbiddenTitlePairs: z
    .array(z.object({ left: z.string(), right: z.string() }))
    .default([]),
});

const batchInputSchema = z.object({
  entities: z.array(entityInputSchema),
});

type ExtractInput = z.output<typeof extractInputSchema>;
type MergeTestInput = z.output<typeof mergeTestInputSchema>;
type DetectMergeCandidateInput = z.output<typeof detectMergeCandidateSchema>;
type MergeProcessingInput = z.output<typeof mergeProcessingSchema>;
type RebuildTopicsInput = z.output<typeof rebuildTopicsSchema>;
type ReconcileExistingTopicsInput = z.output<
  typeof reconcileExistingTopicsSchema
>;
type SequentialInput = z.output<typeof sequentialInputSchema>;
type CorpusAcceptanceInput = z.output<typeof corpusAcceptanceSchema>;
type BatchInput = z.output<typeof batchInputSchema>;

function createEntityFromInput(input: EntityInput, idSuffix = ""): BaseEntity {
  return {
    id: `eval${idSuffix}-${Date.now()}`,
    entityType: input.entityType,
    content: input.content,
    contentHash: computeContentHash(input.content),
    visibility: "public",
    metadata: input.metadata ?? {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

function summarizeExtractedTopic(topic: ExtractedTopic): {
  title: string;
  relevanceScore: number;
} {
  return {
    title: topic.title,
    relevanceScore: topic.relevanceScore,
  };
}

function getSourceTitle(entity: BaseEntity): string {
  const metadataTitle = entity.metadata["title"];
  return typeof metadataTitle === "string" ? metadataTitle : entity.id;
}

function getCorpusAcceptanceIssues(
  topicTitles: string[],
  input: CorpusAcceptanceInput,
): string[] {
  const issues: string[] = [];
  if (topicTitles.length < input.minTopicCount) {
    issues.push(`too few topics: ${topicTitles.length}`);
  }
  if (topicTitles.length > input.maxTopicCount) {
    issues.push(`too many topics: ${topicTitles.length}`);
  }

  for (const pattern of input.requiredTitleMatches) {
    const regex = new RegExp(pattern, "i");
    if (!topicTitles.some((title) => regex.test(title))) {
      issues.push(`missing required title match: ${pattern}`);
    }
  }

  for (const pattern of input.forbiddenTitleMatches) {
    const regex = new RegExp(pattern, "i");
    const match = topicTitles.find((title) => regex.test(title));
    if (match) {
      issues.push(`forbidden title matched ${pattern}: ${match}`);
    }
  }

  for (const pair of input.forbiddenTitlePairs) {
    const left = new RegExp(pair.left, "i");
    const right = new RegExp(pair.right, "i");
    const hasLeft = topicTitles.some((title) => left.test(title));
    const hasRight = topicTitles.some((title) => right.test(title));
    if (hasLeft && hasRight) {
      issues.push(
        `forbidden duplicate pair present: ${pair.left} / ${pair.right}`,
      );
    }
  }

  return issues;
}

function withSource(
  topic: ExtractedTopic,
  entity: BaseEntity,
): ExtractedTopic & {
  sources: Array<{ id: string; type: string; title: string }>;
} {
  return {
    ...topic,
    sources: [
      {
        id: entity.id,
        type: entity.entityType,
        title: getSourceTitle(entity),
      },
    ],
  };
}

async function clearTopics(context: EntityPluginContext): Promise<void> {
  const topics = await context.entityService.listEntities({
    entityType: TOPIC_ENTITY_TYPE,
  });
  await Promise.all(
    topics.map((topic) =>
      context.entityService.deleteEntity({
        entityType: TOPIC_ENTITY_TYPE,
        id: topic.id,
      }),
    ),
  );
}

/**
 * Wait until the embedding queue is empty so seeded topics are searchable
 * before an eval invokes a handler that depends on vector search.
 */
async function waitForEmbeddingsToDrain(
  context: EntityPluginContext,
): Promise<void> {
  for (;;) {
    const active = await context.jobs.getActiveJobs([SHELL_CHANNELS.embedding]);
    if (active.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export function registerTopicEvalHandlers(params: {
  context: EntityPluginContext;
  logger: Logger;
  config: TopicsPluginConfig;
}): void {
  const { context, logger, config } = params;
  const extractor = new TopicExtractor(context, logger);
  const topicAdapter = new TopicAdapter();

  const extractTopics = async (
    input: EntityInput,
    minRelevanceScore: number,
    idSuffix = "",
  ): Promise<ExtractedTopic[]> => {
    const entity = createEntityFromInput(input, idSuffix);
    return extractor.extractFromEntity(entity, minRelevanceScore);
  };

  context.eval.registerHandler("extractFromEntity", async (input: unknown) => {
    await clearTopics(context);
    const parsed: ExtractInput = extractInputSchema.parse(input);
    const minScore = parsed.minRelevanceScore ?? config.minRelevanceScore;
    const entity = createEntityFromInput(parsed);
    const topics = await extractor.extractFromEntity(entity, minScore);
    return topics.map((topic) => withSource(topic, entity));
  });

  context.eval.registerHandler(
    "checkMergeSimilarity",
    async (input: unknown) => {
      await clearTopics(context);
      const parsed: MergeTestInput = mergeTestInputSchema.parse(input);
      const minScore = parsed.minRelevanceScore ?? config.minRelevanceScore;
      const threshold = parsed.threshold ?? config.semanticMergeDistance;

      const [topicsA, topicsB] = await Promise.all([
        extractTopics(parsed.contentA, minScore, "-a"),
        extractTopics(parsed.contentB, minScore, "-b"),
      ]);

      const topicService = new TopicService(context.entityService, logger);
      const seededA: TopicEntity[] = [];
      for (const topic of topicsA) {
        const created = await topicService.createTopic(topic);
        if (created) seededA.push(created);
      }
      await waitForEmbeddingsToDrain(context);

      const mergeCandidates = (
        await Promise.all(
          topicsB.map(async (topic) => {
            const candidate = await topicService.findMergeCandidate({
              incoming: topic,
              threshold,
              additionalCandidates: seededA,
            });
            if (!candidate) return null;
            return {
              incomingTitle: topic.title,
              candidateTitle: candidate.title,
              candidateScore: candidate.score,
            };
          }),
        )
      ).filter(
        (
          candidate,
        ): candidate is {
          incomingTitle: string;
          candidateTitle: string;
          candidateScore: number;
        } => candidate !== null,
      );
      const matchingTitles = mergeCandidates.map(
        (candidate) => candidate.candidateTitle,
      );

      return {
        topicsA: topicsA.map(summarizeExtractedTopic),
        topicsB: topicsB.map(summarizeExtractedTopic),
        matchingTitles,
        mergeCandidates,
        wouldMerge: mergeCandidates.length > 0,
      };
    },
  );

  context.eval.registerHandler(
    "detectMergeCandidate",
    async (input: unknown) => {
      await clearTopics(context);
      const parsed: DetectMergeCandidateInput =
        detectMergeCandidateSchema.parse(input);
      const threshold = parsed.threshold ?? config.semanticMergeDistance;

      const topicService = new TopicService(context.entityService, logger);
      const seeded: TopicEntity[] = [];
      for (const existingTopic of parsed.existingTopics) {
        const created = await topicService.createTopic(existingTopic);
        if (created) seeded.push(created);
      }

      await waitForEmbeddingsToDrain(context);

      const candidate = await topicService.findMergeCandidate({
        incoming: {
          title: parsed.incomingTopic.title,
          content: parsed.incomingTopic.content,
        },
        threshold,
        additionalCandidates: seeded,
      });

      return {
        found: candidate !== null,
        candidateTitle: candidate?.title,
        candidateScore: candidate?.score,
      };
    },
  );

  context.eval.registerHandler(
    "processTopicWithAutoMerge",
    async (input: unknown) => {
      await clearTopics(context);
      const parsed: MergeProcessingInput = mergeProcessingSchema.parse(input);
      const topicService = new TopicService(context.entityService, logger);

      for (const existingTopic of parsed.existingTopics) {
        await topicService.createTopic({
          title: existingTopic.title,
          content: existingTopic.content,
        });
      }

      await waitForEmbeddingsToDrain(context);

      const sourceEntity = createEntityFromInput(
        {
          entityType: "post",
          content: parsed.incomingTopic.content,
          metadata: { title: parsed.incomingTopic.title },
        },
        "-source",
      );

      const result = await extractTopicsBatched(
        [sourceEntity],
        context,
        logger,
        {
          minRelevanceScore: 0,
          autoMerge: true,
          semanticMergeDistance:
            parsed.threshold ?? config.semanticMergeDistance,
        },
      );

      const topics = await context.entityService.listEntities({
        entityType: TOPIC_ENTITY_TYPE,
      });
      return {
        ...result,
        topicCount: topics.length,
        topics: topics.map(toTopicContentProjectionWithMetadata),
      };
    },
  );

  context.eval.registerHandler("rebuildTopics", async (input: unknown) => {
    await clearTopics(context);
    const parsed: RebuildTopicsInput = rebuildTopicsSchema.parse(input);
    const topicService = new TopicService(context.entityService, logger);

    for (const existingTopic of parsed.existingTopics ?? []) {
      await topicService.createTopic(existingTopic);
    }

    const entities = parsed.entities.map((entity, index) =>
      createEntityFromInput(entity, `-rebuild-${index}`),
    );

    const result = await replaceAllTopics(entities, context, logger, config);
    const topics = await context.entityService.listEntities({
      entityType: TOPIC_ENTITY_TYPE,
    });

    return {
      ...result,
      topicCount: topics.length,
      topics: topics.map(toTopicContentProjectionWithMetadata),
    };
  });

  context.eval.registerHandler(
    "reconcileExistingTopics",
    async (input: unknown) => {
      await clearTopics(context);
      const parsed: ReconcileExistingTopicsInput =
        reconcileExistingTopicsSchema.parse(input);

      for (const existingTopic of parsed.existingTopics) {
        const body = topicAdapter.createTopicBody({
          title: existingTopic.title,
          content: existingTopic.content,
        });
        await context.entityService.createEntity({
          entity: {
            id: existingTopic.id ?? existingTopic.title,
            entityType: TOPIC_ENTITY_TYPE,
            content: body,
            visibility: "public",
            metadata: {},
          },
        });
      }

      await waitForEmbeddingsToDrain(context);

      const result = await reconcileTopics({
        context,
        logger,
        semanticMergeDistance: parsed.threshold ?? config.semanticMergeDistance,
        targetVisibility: "public",
        maxPairs: parsed.maxPairs ?? config.reconciliationMaxPairs,
      });
      const topics = await context.entityService.listEntities({
        entityType: TOPIC_ENTITY_TYPE,
      });

      return {
        ...result,
        topicCount: topics.length,
        topics: topics.map(toTopicContentProjectionWithMetadata),
      };
    },
  );

  context.eval.registerHandler(
    "extractSequentially",
    async (input: unknown) => {
      await clearTopics(context);
      const parsed: SequentialInput = sequentialInputSchema.parse(input);
      const minScore = parsed.minRelevanceScore ?? config.minRelevanceScore;
      const topicService = new TopicService(context.entityService, logger);
      const perEntity: Array<{
        extractedTitles: string[];
        extractedCount: number;
      }> = [];

      for (const [index, entityInput] of parsed.entities.entries()) {
        const entity = createEntityFromInput(
          entityInput,
          `-sequential-${index}`,
        );
        const extracted = await extractor.extractFromEntity(entity, minScore);

        for (const topic of extracted) {
          await topicService.createTopic({
            title: topic.title,
            content: topic.content,
          });
        }

        perEntity.push({
          extractedTitles: extracted.map((topic) => topic.title),
          extractedCount: extracted.length,
        });
      }

      const topics = await context.entityService.listEntities({
        entityType: TOPIC_ENTITY_TYPE,
      });
      return {
        totalTopics: topics.length,
        perEntity,
        topics: topics.map(toTopicContentProjection),
      };
    },
  );

  context.eval.registerHandler(
    "rebuildCorpusFixture",
    async (input: unknown) => {
      await clearTopics(context);
      const parsed: CorpusAcceptanceInput = corpusAcceptanceSchema.parse(input);
      const fixture = corpusFixtureSchema.parse(
        JSON.parse(
          await readFile(resolve(process.cwd(), parsed.fixture), "utf8"),
        ),
      );
      const entities: BaseEntity[] = fixture.entities.map((entity) => ({
        id: entity.id,
        entityType: entity.entityType,
        content: entity.content,
        contentHash: computeContentHash(entity.content),
        visibility: "public",
        metadata: entity.metadata ?? {},
        created: "2026-01-01T00:00:00Z",
        updated: "2026-01-01T00:00:00Z",
      }));

      const rebuildResult = await replaceAllTopics(
        entities,
        context,
        logger,
        config,
      );
      const reconciliationResult = await reconcileTopics({
        context,
        logger,
        semanticMergeDistance: config.semanticMergeDistance,
        targetVisibility: config.extractionVisibility,
        maxPairs: config.reconciliationMaxPairs,
      });
      const topics = (
        await context.entityService.listEntities({
          entityType: TOPIC_ENTITY_TYPE,
        })
      ).map(toTopicContentProjectionWithMetadata);
      const topicTitles = topics.map((topic) => topic.title);
      const issues = getCorpusAcceptanceIssues(topicTitles, parsed);

      return {
        sourceCount: entities.length,
        topicCount: topics.length,
        topicTitles,
        issueCount: issues.length,
        issues,
        rebuild: rebuildResult,
        reconciliation: reconciliationResult,
        topics,
      };
    },
  );

  context.eval.registerHandler("batchExtract", async (input: unknown) => {
    await clearTopics(context);
    const parsed: BatchInput = batchInputSchema.parse(input);
    const entities = parsed.entities.map((entity, index) =>
      createEntityFromInput(entity, `-batch-${index}`),
    );

    const result = await extractTopicsBatched(entities, context, logger, {
      minRelevanceScore: config.minRelevanceScore,
    });

    // Return created topics so the eval can inspect them
    const topics = await context.entityService.listEntities({
      entityType: TOPIC_ENTITY_TYPE,
    });
    return {
      ...result,
      topicCount: topics.length,
      topics: topics.map(toTopicContentProjection),
    };
  });
}
