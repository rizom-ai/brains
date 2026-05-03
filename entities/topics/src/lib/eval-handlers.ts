import type { BaseEntity, EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { ProgressReporter, z } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import type { TopicsPluginConfig } from "../schemas/config";
import { TopicProcessingHandler } from "../handlers/topic-processing-handler";
import { TopicExtractor, type ExtractedTopic } from "./topic-extractor";
import { extractTopicsBatched } from "./topic-batch-extractor";
import { TOPIC_ENTITY_TYPE } from "./constants";
import {
  toTopicContentProjection,
  toTopicContentProjectionWithMetadata,
} from "./topic-presenter";
import { replaceAllTopics } from "./topic-projection";
import { TopicService } from "./topic-service";

const entityInputSchema = z.object({
  entityType: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

type EntityInput = z.infer<typeof entityInputSchema>;

const extractInputSchema = entityInputSchema.extend({
  minRelevanceScore: z.number().optional(),
});

const mergeTestInputSchema = z.object({
  contentA: entityInputSchema,
  contentB: entityInputSchema,
  minRelevanceScore: z.number().optional(),
});

const detectionTopicSchema = z.object({
  title: z.string(),
  content: z.string(),
});

const detectMergeCandidateSchema = z.object({
  existingTopics: z.array(detectionTopicSchema),
  incomingTopic: detectionTopicSchema,
  threshold: z.number().optional(),
});

const aliasMergeSchema = z.object({
  existingAliases: z.array(z.string()).optional(),
  canonicalTitle: z.string(),
  candidateAliases: z.array(z.string()),
});

const mergeProcessingSchema = z.object({
  existingTopics: z
    .array(
      detectionTopicSchema.extend({
        aliases: z.array(z.string()).optional(),
      }),
    )
    .default([]),
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

const batchInputSchema = z.object({
  entities: z.array(entityInputSchema),
});

function createEntityFromInput(input: EntityInput, idSuffix = ""): BaseEntity {
  return {
    id: `eval${idSuffix}-${Date.now()}`,
    entityType: input.entityType,
    content: input.content,
    contentHash: computeContentHash(input.content),
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

export function registerTopicEvalHandlers(params: {
  context: EntityPluginContext;
  logger: Logger;
  config: TopicsPluginConfig;
}): void {
  const { context, logger, config } = params;
  const extractor = new TopicExtractor(context, logger);

  const extractTopics = async (
    input: EntityInput,
    minRelevanceScore: number,
    idSuffix = "",
  ): Promise<ExtractedTopic[]> => {
    const entity = createEntityFromInput(input, idSuffix);
    return extractor.extractFromEntity(entity, minRelevanceScore);
  };

  context.eval.registerHandler("extractFromEntity", async (input: unknown) => {
    const parsed = extractInputSchema.parse(input);
    const minScore = parsed.minRelevanceScore ?? config.minRelevanceScore;
    return extractTopics(parsed, minScore);
  });

  context.eval.registerHandler(
    "checkMergeSimilarity",
    async (input: unknown) => {
      const parsed = mergeTestInputSchema.parse(input);
      const minScore = parsed.minRelevanceScore ?? config.minRelevanceScore;

      const [topicsA, topicsB] = await Promise.all([
        extractTopics(parsed.contentA, minScore, "-a"),
        extractTopics(parsed.contentB, minScore, "-b"),
      ]);

      const titlesA = topicsA.map((topic) => topic.title.toLowerCase());
      const titlesB = topicsB.map((topic) => topic.title.toLowerCase());
      const matchingTitles = titlesA.filter((title) => titlesB.includes(title));

      return {
        topicsA: topicsA.map(summarizeExtractedTopic),
        topicsB: topicsB.map(summarizeExtractedTopic),
        matchingTitles,
        wouldMerge: matchingTitles.length > 0,
      };
    },
  );

  context.eval.registerHandler(
    "detectMergeCandidate",
    async (input: unknown) => {
      const parsed = detectMergeCandidateSchema.parse(input);
      const threshold = parsed.threshold ?? config.mergeSimilarityThreshold;
      const topicService = new TopicService(context.entityService, logger);

      for (const existingTopic of parsed.existingTopics) {
        await topicService.createTopic(existingTopic);
      }

      const candidate = await topicService.findMergeCandidate(
        {
          title: parsed.incomingTopic.title,
        },
        threshold,
      );

      return {
        found: candidate !== null,
        candidateTitle: candidate?.title,
        candidateScore: candidate?.score,
      };
    },
  );

  context.eval.registerHandler("mergeAliases", async (input: unknown) => {
    const parsed = aliasMergeSchema.parse(input);
    const topicService = new TopicService(context.entityService, logger);

    return {
      aliases: topicService.mergeAliases(
        parsed.existingAliases,
        parsed.canonicalTitle,
        parsed.candidateAliases,
      ),
    };
  });

  context.eval.registerHandler(
    "processTopicWithAutoMerge",
    async (input: unknown) => {
      const parsed = mergeProcessingSchema.parse(input);
      const topicService = new TopicService(context.entityService, logger);

      for (const existingTopic of parsed.existingTopics) {
        await topicService.createTopic({
          title: existingTopic.title,
          content: existingTopic.content,
          metadata: { aliases: existingTopic.aliases ?? [] },
        });
      }

      const handler = new TopicProcessingHandler(context, logger);
      const progressReporter = ProgressReporter.from(async () => {});
      if (!progressReporter) {
        throw new Error("Failed to create progress reporter");
      }

      const result = await handler.process(
        {
          topic: {
            title: parsed.incomingTopic.title,
            content: parsed.incomingTopic.content,
            relevanceScore: parsed.incomingTopic.relevanceScore ?? 0.9,
          },
          sourceEntityId: "eval-source",
          sourceEntityType: "post",
          autoMerge: true,
          mergeSimilarityThreshold:
            parsed.threshold ?? config.mergeSimilarityThreshold,
        },
        `eval-job-${Date.now()}`,
        progressReporter,
      );

      const topics =
        await context.entityService.listEntities(TOPIC_ENTITY_TYPE);
      return {
        ...result,
        topicCount: topics.length,
        topics: topics.map(toTopicContentProjectionWithMetadata),
      };
    },
  );

  context.eval.registerHandler("rebuildTopics", async (input: unknown) => {
    const parsed = rebuildTopicsSchema.parse(input);
    const topicService = new TopicService(context.entityService, logger);

    for (const existingTopic of parsed.existingTopics ?? []) {
      await topicService.createTopic(existingTopic);
    }

    const entities = parsed.entities.map((entity, index) =>
      createEntityFromInput(entity, `-rebuild-${index}`),
    );

    const result = await replaceAllTopics(entities, context, logger);
    const topics = await context.entityService.listEntities(TOPIC_ENTITY_TYPE);

    return {
      ...result,
      topicCount: topics.length,
      topics: topics.map(toTopicContentProjectionWithMetadata),
    };
  });

  context.eval.registerHandler(
    "extractSequentially",
    async (input: unknown) => {
      const parsed = sequentialInputSchema.parse(input);
      const minScore = parsed.minRelevanceScore ?? config.minRelevanceScore;
      const topicService = new TopicService(context.entityService, logger);
      const perEntity: Array<{ extractedTitles: string[] }> = [];

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
        });
      }

      const topics =
        await context.entityService.listEntities(TOPIC_ENTITY_TYPE);
      return {
        totalTopics: topics.length,
        perEntity,
        topics: topics.map(toTopicContentProjection),
      };
    },
  );

  context.eval.registerHandler("batchExtract", async (input: unknown) => {
    const parsed = batchInputSchema.parse(input);
    const entities = parsed.entities.map((entity, index) =>
      createEntityFromInput(entity, `-batch-${index}`),
    );

    const result = await extractTopicsBatched(entities, context, logger);

    // Return created topics so the eval can inspect them
    const topics = await context.entityService.listEntities(TOPIC_ENTITY_TYPE);
    return {
      ...result,
      topics: topics.map(toTopicContentProjection),
    };
  });
}
