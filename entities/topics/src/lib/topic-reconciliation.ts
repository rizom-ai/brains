import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ExtractedTopicData } from "../schemas/extraction";
import type { TopicEntity } from "../types";
import { TOPIC_ENTITY_TYPE, TOPICS_BATCH_COMPLETED_EVENT } from "./constants";
import { TopicAdapter } from "./topic-adapter";
import {
  TopicMergeSynthesizer,
  type ITopicMergeSynthesizer,
} from "./topic-merge-synthesizer";
import { TopicService } from "./topic-service";

const adapter = new TopicAdapter();

export interface TopicReconciliationOptions {
  context: EntityPluginContext;
  logger: Logger;
  semanticMergeDistance: number;
  targetVisibility?: ContentVisibility;
  maxPairs?: number;
  emitEvent?: boolean;
  synthesizer?: ITopicMergeSynthesizer;
}

export interface TopicReconciliationResult {
  success: true;
  scannedTopics: number;
  scannedPairs: number;
  merged: number;
  distinct: number;
  skipped: number;
  deletedIds: string[];
}

export async function reconcileTopics(
  options: TopicReconciliationOptions,
): Promise<TopicReconciliationResult> {
  const targetVisibility = options.targetVisibility ?? "public";
  const maxPairs = options.maxPairs ?? 100;
  const topicService = new TopicService(
    options.context.entityService,
    options.logger,
  );
  const synthesizer =
    options.synthesizer ??
    new TopicMergeSynthesizer(options.context, options.logger);

  const result: TopicReconciliationResult = {
    success: true,
    scannedTopics: 0,
    scannedPairs: 0,
    merged: 0,
    distinct: 0,
    skipped: 0,
    deletedIds: [],
  };
  const reviewedPairs = new Set<string>();

  let changed = true;
  while (changed && result.scannedPairs < maxPairs) {
    changed = false;
    const topics = sortTopics(
      await topicService.listTopics({ visibility: targetVisibility }),
    );
    result.scannedTopics += topics.length;

    for (const topic of topics) {
      if (result.scannedPairs >= maxPairs) break;
      if (result.deletedIds.includes(topic.id)) continue;

      const parsed = adapter.parseTopicBody(topic.content);
      const distanceResults =
        await options.context.entityService.searchWithDistances({
          query: `${parsed.title}\n\n${parsed.content}`,
        });

      for (const distanceResult of distanceResults) {
        if (result.scannedPairs >= maxPairs) break;
        if (distanceResult.entityType !== TOPIC_ENTITY_TYPE) continue;
        if (distanceResult.entityId === topic.id) continue;
        if (distanceResult.distance > options.semanticMergeDistance) continue;

        const other = await topicService.getTopic(
          distanceResult.entityId,
          targetVisibility,
        );
        if (!other || other.id === topic.id) continue;

        const pairKey = getPairKey(topic.id, other.id);
        if (reviewedPairs.has(pairKey)) continue;
        reviewedPairs.add(pairKey);
        result.scannedPairs++;

        const { canonical, absorbed } = chooseCanonicalTopic(topic, other);
        const absorbedParsed = adapter.parseTopicBody(absorbed.content);
        const synthesized = await synthesizer.synthesize({
          existingTopic: canonical,
          incomingTopic: {
            title: absorbedParsed.title,
            content: absorbedParsed.content,
            relevanceScore: 1,
          } satisfies ExtractedTopicData,
        });

        if (synthesized.verdict === "distinct") {
          result.distinct++;
          continue;
        }

        const merged = await topicService.applySynthesizedMerge({
          existingId: canonical.id,
          synthesized: {
            title: synthesized.title,
            content: synthesized.content,
          },
          visibility: targetVisibility,
        });
        if (!merged) {
          result.skipped++;
          continue;
        }

        await topicService.deleteTopic(absorbed.id);
        result.deletedIds.push(absorbed.id);
        result.merged++;
        changed = true;
        break;
      }

      if (changed) break;
    }
  }

  if (result.merged > 0 && options.emitEvent !== false) {
    await options.context.messaging.send({
      type: TOPICS_BATCH_COMPLETED_EVENT,
      payload: result,
      broadcast: true,
    });
  }

  return result;
}

function sortTopics(topics: TopicEntity[]): TopicEntity[] {
  return [...topics].sort((left, right) => {
    const created = left.created.localeCompare(right.created);
    if (created !== 0) return created;
    return left.id.localeCompare(right.id);
  });
}

function chooseCanonicalTopic(
  left: TopicEntity,
  right: TopicEntity,
): { canonical: TopicEntity; absorbed: TopicEntity } {
  const leftContentLength = adapter.parseTopicBody(left.content).content.length;
  const rightContentLength = adapter.parseTopicBody(right.content).content
    .length;

  if (leftContentLength !== rightContentLength) {
    return leftContentLength > rightContentLength
      ? { canonical: left, absorbed: right }
      : { canonical: right, absorbed: left };
  }

  const created = left.created.localeCompare(right.created);
  if (created !== 0) {
    return created < 0
      ? { canonical: left, absorbed: right }
      : { canonical: right, absorbed: left };
  }

  return left.id.localeCompare(right.id) <= 0
    ? { canonical: left, absorbed: right }
    : { canonical: right, absorbed: left };
}

function getPairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join("\u0000");
}
