import type { IEntityService, SearchResult } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { TopicEntity } from "../types";
import type { TopicMetadata } from "../schemas/topic";
import type { ExtractedTopicData } from "../schemas/extraction";
import { TopicAdapter } from "./topic-adapter";
import { generateIdFromText } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import { TOPIC_ENTITY_TYPE } from "./constants";
import { scoreTopicSimilarity } from "./topic-merge";

const MAX_ALIASES = 5;

export interface TopicMergeCandidate {
  topic: TopicEntity;
  title: string;
  score: number;
}

export class TopicService {
  private adapter: TopicAdapter;

  constructor(
    private readonly entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.adapter = new TopicAdapter();
  }

  public async createTopic(params: {
    title: string;
    content: string;
    metadata?: TopicMetadata;
  }): Promise<TopicEntity | null> {
    const topicId = generateIdFromText(params.title);

    // If topic exists by slug, skip (preserves user edits)
    const existing = await this.getTopic(topicId);
    if (existing) {
      this.logger.debug("Topic already exists, skipping", {
        id: topicId,
        title: params.title,
      });
      return existing;
    }

    return this.insertTopic(topicId, params);
  }

  public async createTopicFromPreloadedIndex(params: {
    title: string;
    content: string;
    metadata?: TopicMetadata;
  }): Promise<{ topic: TopicEntity | null; created: boolean }> {
    const topicId = generateIdFromText(params.title);

    try {
      return {
        topic: await this.insertTopic(topicId, params),
        created: true,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        this.logger.debug("Topic was created concurrently, fetching existing", {
          id: topicId,
          title: params.title,
        });
        return {
          topic: await this.getTopic(topicId),
          created: false,
        };
      }
      throw error;
    }
  }

  private async insertTopic(
    topicId: string,
    params: {
      title: string;
      content: string;
      metadata?: TopicMetadata;
    },
  ): Promise<TopicEntity> {
    const metadata: TopicMetadata = params.metadata ?? { aliases: [] };

    const body = this.adapter.createTopicBody({
      title: params.title,
      content: params.content,
    });

    const { entityId } = await this.entityService.createEntity({
      entity: {
        id: topicId,
        entityType: TOPIC_ENTITY_TYPE,
        content: body,
        metadata,
      },
    });

    const topic: TopicEntity = {
      id: entityId,
      entityType: TOPIC_ENTITY_TYPE,
      content: body,
      contentHash: computeContentHash(body),
      metadata,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    this.logger.debug("Created topic", {
      id: topic.id,
      title: params.title,
    });

    return topic;
  }

  public async updateTopic(
    id: string,
    updates: {
      title?: string;
      content?: string;
      metadata?: TopicMetadata;
    },
  ): Promise<TopicEntity | null> {
    const existing = await this.getTopic(id);
    if (!existing) {
      return null;
    }

    const parsed = this.adapter.parseTopicBody(existing.content);

    const title = updates.title ?? parsed.title;
    const content = updates.content ?? parsed.content;
    const metadata: TopicMetadata = updates.metadata ?? existing.metadata;

    const newBody = this.adapter.createTopicBody({
      title,
      content,
    });

    const { entityId } = await this.entityService.updateEntity({
      entity: {
        ...existing,
        content: newBody,
        metadata,
      },
    });

    const updatedTopic: TopicEntity = {
      ...existing,
      id: entityId,
      content: newBody,
      contentHash: computeContentHash(newBody),
      metadata,
      updated: new Date().toISOString(),
    };

    this.logger.info("Updated topic", { id });

    return updatedTopic;
  }

  public async getTopic(id: string): Promise<TopicEntity | null> {
    return this.entityService.getEntity<TopicEntity>({
      entityType: TOPIC_ENTITY_TYPE,
      id,
    });
  }

  public async listTopics(params?: {
    limit?: number;
    offset?: number;
  }): Promise<TopicEntity[]> {
    return this.entityService.listEntities<TopicEntity>({
      entityType: TOPIC_ENTITY_TYPE,
      ...(params !== undefined ? { options: params } : {}),
    });
  }

  public async searchTopics(
    query: string,
    limit = 10,
  ): Promise<SearchResult<TopicEntity>[]> {
    return this.entityService.search<TopicEntity>({
      query,
      options: {
        types: [TOPIC_ENTITY_TYPE],
        limit,
      },
    });
  }

  public async findMergeCandidate(
    incoming: Pick<ExtractedTopicData, "title">,
    threshold: number,
  ): Promise<TopicMergeCandidate | null> {
    const topics = await this.listTopics();
    let bestCandidate: TopicMergeCandidate | null = null;

    for (const topic of topics) {
      const parsed = this.adapter.parseTopicBody(topic.content);
      const score = scoreTopicSimilarity(incoming, {
        title: parsed.title,
      });

      if (score < threshold) continue;
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          topic,
          title: parsed.title,
          score,
        };
      }
    }

    return bestCandidate;
  }

  public mergeAliases(
    existingAliases: string[] | undefined,
    canonicalTitle: string,
    candidateAliases: string[],
  ): string[] {
    const normalizedCanonical = canonicalTitle.trim().toLowerCase();
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const alias of [...(existingAliases ?? []), ...candidateAliases]) {
      const trimmed = alias.trim();
      if (trimmed.length === 0) continue;
      if (trimmed.toLowerCase() === normalizedCanonical) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
      if (merged.length >= MAX_ALIASES) break;
    }

    return merged;
  }

  public async applySynthesizedMerge(params: {
    existingId: string;
    synthesized: {
      title: string;
      content: string;
    };
    aliasCandidates: string[];
  }): Promise<TopicEntity | null> {
    const existing = await this.getTopic(params.existingId);
    if (!existing) return null;

    const aliases = this.mergeAliases(
      existing.metadata.aliases,
      params.synthesized.title,
      params.aliasCandidates,
    );

    return this.updateTopic(params.existingId, {
      title: params.synthesized.title,
      content: params.synthesized.content,
      metadata: { aliases },
    });
  }

  public async deleteTopic(id: string): Promise<boolean> {
    const result = await this.entityService.deleteEntity({
      entityType: TOPIC_ENTITY_TYPE,
      id,
    });
    if (result) {
      this.logger.info("Deleted topic", { id });
    }
    return result;
  }

  public async mergeTopics(
    topicIds: string[],
    targetId?: string,
  ): Promise<TopicEntity | null> {
    const topics = await Promise.all(topicIds.map((id) => this.getTopic(id)));
    const validTopics = topics.filter((t): t is TopicEntity => t !== null);

    if (validTopics.length < 2) {
      this.logger.warn("Not enough valid topics to merge", { topicIds });
      return null;
    }

    const target = targetId
      ? validTopics.find((t) => t.id === targetId)
      : validTopics[0];

    if (!target) {
      this.logger.error("Target topic not found", { targetId });
      return null;
    }

    const allContent: string[] = [];

    for (const topic of validTopics) {
      const parsed = this.adapter.parseTopicBody(topic.content);

      if (topic.id !== target.id) {
        allContent.push(parsed.content);
      }
    }

    const targetParsed = this.adapter.parseTopicBody(target.content);
    const mergedContent = [targetParsed.content, ...allContent].join(
      "\n\n---\n\n",
    );

    const merged = await this.updateTopic(target.id, {
      content: mergedContent,
    });

    if (merged) {
      for (const topic of validTopics) {
        if (topic.id !== target.id) {
          await this.deleteTopic(topic.id);
        }
      }

      this.logger.info("Merged topics", {
        mergedInto: target.id,
        deletedIds: topicIds.filter((id) => id !== target.id),
      });
    }

    return merged;
  }
}
