import {
  ProjectionJsonObjectSchema,
  defineProjectionRule,
  isVisibleWithinScope,
  scopedDerivedId,
  type ProjectionRule,
  type ProjectionSourceRole,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import { generateIdFromText } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type {
  TopicSourceRolePolicy,
  TopicsPluginConfig,
} from "../schemas/config";
import { extractedTopicSchema } from "../schemas/extraction";
import { topicExtractionTemplate } from "../templates/extraction-template";
import { TOPIC_ENTITY_TYPE, TOPIC_PROJECTION_ID } from "./constants";
import { buildTopicExtractionPrompt } from "./extraction-prompt";
import { createTopicBody, parseTopicBody } from "./topic-body";

const sourceInputSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string(),
  content: z.string(),
  weight: z.number().min(0).max(1),
  canMint: z.boolean(),
});

const topicWaveInputSchema = z.object({
  sources: z.array(sourceInputSchema),
  existingTopics: z.array(z.object({ id: z.string(), title: z.string() })),
  minRelevanceScore: z.number().min(0).max(1),
  createRelevanceThreshold: z.number().min(0).max(1),
  reinforceRelevanceThreshold: z.number().min(0).max(1),
  maxEntitiesPerBatch: z.number().int().positive(),
  topicSoftCeilingSourceRatio: z.number().positive(),
  targetVisibility: z.enum(["public", "shared", "restricted"]),
  templatePrompt: z.string(),
  extractionTemplate: z.string(),
  model: z.string(),
  identity: ProjectionJsonObjectSchema,
});

type TopicWaveInput = z.output<typeof topicWaveInputSchema>;
type TopicSourceInput = z.output<typeof sourceInputSchema>;

const sourceMetadataSchema = z.looseObject({
  title: z.string().optional(),
  status: z.string().nullable().optional(),
});

function sourcePolicy(
  entityType: string,
  config: TopicsPluginConfig,
  entityTypeConfig: {
    projectionSource?: boolean;
    projectionSourceRole?: ProjectionSourceRole;
  },
): TopicSourceRolePolicy {
  const role =
    config.sourceRoleOverrides[entityType] ??
    entityTypeConfig.projectionSourceRole ??
    (entityTypeConfig.projectionSource === false ? "excluded" : "primary");
  const rolePolicy = config.sourceRolePolicies[role];
  return {
    weight:
      Object.keys(config.sourceWeights).length > 0
        ? (config.sourceWeights[entityType] ?? 1)
        : rolePolicy.weight,
    canMint:
      config.mintableEntityTypes.length > 0
        ? config.mintableEntityTypes.includes(entityType)
        : rolePolicy.canMint,
  };
}

function includesSourceType(
  entityType: string,
  config: TopicsPluginConfig,
  projectionSource: boolean | undefined,
): boolean {
  return (
    entityType !== TOPIC_ENTITY_TYPE &&
    !config.excludeEntityTypes.includes(entityType) &&
    (config.includeEntityTypes.includes("*") ||
      config.includeEntityTypes.includes(entityType)) &&
    projectionSource !== false
  );
}

async function selectTopicWaveInput(
  context: Parameters<ProjectionRule["selectInput"]>[1],
  config: TopicsPluginConfig,
  extractionTemplate: string,
): Promise<TopicWaveInput> {
  const entityTypes = context.entities
    .getEntityTypes()
    .filter((entityType) => {
      const entityTypeConfig = context.entities.getEntityTypeConfig(entityType);
      return includesSourceType(
        entityType,
        config,
        entityTypeConfig.projectionSource,
      );
    })
    .sort();
  const sources = (
    await Promise.all(
      entityTypes.map(async (entityType) => {
        const entityTypeConfig =
          context.entities.getEntityTypeConfig(entityType);
        const policy = sourcePolicy(entityType, config, entityTypeConfig);
        const entities = await context.entities.listEntities({ entityType });
        return entities.flatMap((entity): TopicSourceInput[] => {
          if (
            !isVisibleWithinScope(
              entity.visibility,
              config.extractionVisibility,
            )
          ) {
            return [];
          }
          const metadata = sourceMetadataSchema.safeParse(entity.metadata);
          const status = metadata.success ? metadata.data.status : undefined;
          if (
            status !== undefined &&
            status !== null &&
            !config.extractableStatuses.includes(status)
          ) {
            return [];
          }
          return [
            {
              id: entity.id,
              entityType,
              title: metadata.success
                ? (metadata.data.title ?? entity.id)
                : entity.id,
              content: entity.content,
              weight: policy.weight,
              canMint: policy.canMint,
            },
          ];
        });
      }),
    )
  )
    .flat()
    .sort(
      (left, right) =>
        left.entityType.localeCompare(right.entityType) ||
        left.id.localeCompare(right.id),
    );
  const [topics, templatePrompt, appInfo] = await Promise.all([
    context.entities.listEntities({
      entityType: TOPIC_ENTITY_TYPE,
      options: {
        filter: { visibilityScope: config.extractionVisibility },
      },
    }),
    context.resolvePrompt(
      // The template's own stable name, not its scoped registration key:
      // a prompt entity is user-editable and must not move when the
      // package's runtime scope does.
      topicExtractionTemplate.name,
      topicExtractionTemplate.basePrompt ?? "",
    ),
    context.appInfo(),
  ]);
  const existingTopics = topics
    .filter((topic) => topic.visibility === config.extractionVisibility)
    .map((topic) => ({
      id: topic.id,
      title: parseTopicBody(topic.content).title,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    sources,
    existingTopics,
    minRelevanceScore: config.minRelevanceScore,
    createRelevanceThreshold: config.createRelevanceThreshold,
    reinforceRelevanceThreshold: config.reinforceRelevanceThreshold,
    maxEntitiesPerBatch: config.maxEntitiesPerBatch,
    topicSoftCeilingSourceRatio: config.topicSoftCeilingSourceRatio,
    targetVisibility: config.extractionVisibility,
    templatePrompt,
    extractionTemplate,
    model: appInfo.ai.model,
    identity: context.identityInput(),
  };
}

function buildSourceBatchPrompt(
  batch: readonly TopicSourceInput[],
  existingTopicTitles: readonly string[],
): string {
  const content = batch
    .map((source, index) => {
      const type =
        source.entityType.charAt(0).toUpperCase() + source.entityType.slice(1);
      return `---\n[${index + 1}] ${type}: ${source.title}\n\n${source.content}`;
    })
    .join("\n\n");
  return buildTopicExtractionPrompt({
    entityTitle: `Batch of ${batch.length} entities`,
    entityType: "batch",
    content,
    existingTopicTitles: [...existingTopicTitles],
  });
}

function topicSoftCeiling(sourceCount: number, sourceRatio: number): number {
  return Math.min(24, Math.max(5, Math.ceil(sourceCount / sourceRatio)));
}

async function deriveTopicIntents(
  input: TopicWaveInput,
  context: Parameters<ProjectionRule["derive"]>[1],
  signal: AbortSignal,
): Promise<readonly ProjectionWriteIntent[]> {
  if (input.sources.length === 0) return [];

  const existingIds = new Set(input.existingTopics.map(({ id }) => id));
  const existingTitles = input.existingTopics.map(({ title }) => title);
  const desired = new Map<
    string,
    { title: string; content: string; weightedRelevance: number }
  >();
  const ceiling = topicSoftCeiling(
    input.sources.length,
    input.topicSoftCeilingSourceRatio,
  );

  for (
    let index = 0;
    index < input.sources.length;
    index += input.maxEntitiesPerBatch
  ) {
    if (signal.aborted) throw signal.reason;
    const batch = input.sources.slice(index, index + input.maxEntitiesPerBatch);
    const result = await context.ai.generate<{
      topics: z.output<typeof extractedTopicSchema>[];
    }>({
      prompt: buildSourceBatchPrompt(batch, [
        ...existingTitles,
        ...[...desired.values()].map(({ title }) => title),
      ]),
      templateName: input.extractionTemplate,
      representedIdentity: "none",
    });
    const extracted = z.array(extractedTopicSchema).parse(result.topics);
    const weight = Math.max(...batch.map((source) => source.weight));
    const canMint = batch.some((source) => source.canMint);

    for (const topic of extracted) {
      const weightedRelevance = topic.relevanceScore * weight;
      if (
        topic.relevanceScore < input.minRelevanceScore ||
        weightedRelevance < input.reinforceRelevanceThreshold
      ) {
        continue;
      }
      const id = scopedDerivedId(
        generateIdFromText(topic.title),
        input.targetVisibility,
      );
      if (existingIds.has(id)) continue;
      if (
        !canMint ||
        weightedRelevance < input.createRelevanceThreshold ||
        input.existingTopics.length + desired.size >= ceiling
      ) {
        continue;
      }
      const current = desired.get(id);
      if (!current || current.weightedRelevance < weightedRelevance) {
        desired.set(id, {
          title: topic.title,
          content: topic.content,
          weightedRelevance,
        });
      }
    }
  }
  return [...desired.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, topic]) => ({
      operation: "upsert" as const,
      entity: {
        id,
        entityType: TOPIC_ENTITY_TYPE,
        content: createTopicBody(topic),
        metadata: {},
        visibility: input.targetVisibility,
      },
    }));
}

export function createTopicProjectionRule(
  config: TopicsPluginConfig,
  // Resolved by the runtime rather than spelled out here: a package that
  // writes its own scope prefix breaks silently the moment the scope moves.
  extractionTemplate: string,
): ProjectionRule {
  const sourceTypes = config.includeEntityTypes;
  const excludeTypes = [
    TOPIC_ENTITY_TYPE,
    ...config.excludeEntityTypes.filter((type) => type !== TOPIC_ENTITY_TYPE),
  ];
  return defineProjectionRule({
    id: TOPIC_PROJECTION_ID,
    version: "1",
    sources: [
      {
        kind: "entity",
        types: sourceTypes,
        ...(excludeTypes.length > 0 ? { excludeTypes } : {}),
      },
    ],
    targetType: TOPIC_ENTITY_TYPE,
    sourceChangeBatchDelayMs: config.sourceChangeBatchDelayMs,
    inputSchema: topicWaveInputSchema,
    selectInput: async (_trigger, context) =>
      selectTopicWaveInput(context, config, extractionTemplate),
    derive: deriveTopicIntents,
  });
}
