import type {
  ContentVisibility,
  IEntityService,
  SearchResult,
} from "@brains/plugins";
import { scopedDerivedId } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { TopicEntity } from "../types";
import type { ExtractedTopicData } from "../schemas/extraction";
import type { TopicMetadata } from "../schemas/topic";
import { TopicAdapter } from "./topic-adapter";
import { generateIdFromText } from "@brains/utils/string-utils";
import { computeContentHash } from "@brains/utils/hash";
import { TOPIC_ENTITY_TYPE } from "./constants";

export interface TopicMergeCandidate {
  topic: TopicEntity;
  title: string;
  score: number;
}

export class TopicService {
  private readonly entityService: IEntityService;
  private readonly logger: Logger;
  private adapter: TopicAdapter;

  constructor(entityService: IEntityService, logger: Logger) {
    this.entityService = entityService;
    this.logger = logger;
    this.adapter = new TopicAdapter();
  }

  public async createTopic(params: {
    title: string;
    content: string;
    metadata?: TopicMetadata;
    visibility?: ContentVisibility;
  }): Promise<TopicEntity | null> {
    const visibility = params.visibility ?? "public";
    const topicId = this.getTopicIdForTitle(params.title, visibility);

    // If topic exists in this visibility partition, skip (preserves user edits)
    const existing = await this.getTopic(topicId, visibility);
    if (existing) {
      this.logger.debug("Topic already exists, skipping", {
        id: topicId,
        title: params.title,
      });
      return existing;
    }

    return this.insertTopic(topicId, params);
  }

  /**
   * Insert a new topic; on a concurrent-insert race, fetch the existing one
   * instead of failing. For batch callers that have already checked
   * existence against an in-memory index, this avoids the eager `getTopic`
   * roundtrip that `createTopic` would do.
   */
  public async createTopicOptimistic(params: {
    title: string;
    content: string;
    metadata?: TopicMetadata;
    visibility?: ContentVisibility;
  }): Promise<{ topic: TopicEntity | null; created: boolean }> {
    const visibility = params.visibility ?? "public";
    const topicId = this.getTopicIdForTitle(params.title, visibility);

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
          topic: await this.getTopic(topicId, visibility),
          created: false,
        };
      }
      throw error;
    }
  }

  public getTopicIdForTitle(
    title: string,
    visibility: ContentVisibility = "public",
  ): string {
    return scopedDerivedId(generateIdFromText(title), visibility);
  }

  private async insertTopic(
    topicId: string,
    params: {
      title: string;
      content: string;
      metadata?: TopicMetadata;
      visibility?: ContentVisibility;
    },
  ): Promise<TopicEntity> {
    const metadata: TopicMetadata = params.metadata ?? {};

    const body = this.adapter.createTopicBody({
      title: params.title,
      content: params.content,
    });

    const { entityId } = await this.entityService.createEntity({
      entity: {
        id: topicId,
        entityType: TOPIC_ENTITY_TYPE,
        content: body,
        visibility: params.visibility ?? "public",
        metadata,
      },
    });

    const topic: TopicEntity = {
      id: entityId,
      entityType: TOPIC_ENTITY_TYPE,
      content: body,
      contentHash: computeContentHash(body),
      visibility: params.visibility ?? "public",
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
    visibility: ContentVisibility = "public",
  ): Promise<TopicEntity | null> {
    const existing = await this.getTopic(id, visibility);
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

  public async getTopic(
    id: string,
    visibility: ContentVisibility = "public",
  ): Promise<TopicEntity | null> {
    const topic = await this.entityService.getEntity<TopicEntity>({
      entityType: TOPIC_ENTITY_TYPE,
      id,
      visibilityScope: visibility,
    });
    return topic?.visibility === visibility ? topic : null;
  }

  public async listTopics(params?: {
    limit?: number;
    offset?: number;
    visibility?: ContentVisibility;
  }): Promise<TopicEntity[]> {
    const listOptions = {
      ...(params?.limit !== undefined ? { limit: params.limit } : {}),
      ...(params?.offset !== undefined ? { offset: params.offset } : {}),
      ...(params?.visibility !== undefined
        ? { filter: { visibilityScope: params.visibility } }
        : {}),
    };
    const topics = await this.entityService.listEntities<TopicEntity>({
      entityType: TOPIC_ENTITY_TYPE,
      ...(params !== undefined ? { options: listOptions } : {}),
    });

    return params?.visibility === undefined
      ? topics
      : topics.filter((topic) => topic.visibility === params.visibility);
  }

  public async searchTopics(
    query: string,
    limit = 10,
    visibilityScope?: ContentVisibility,
  ): Promise<SearchResult<TopicEntity>[]> {
    return this.entityService.search<TopicEntity>({
      query,
      options: {
        types: [TOPIC_ENTITY_TYPE],
        limit,
        ...(visibilityScope !== undefined ? { visibilityScope } : {}),
      },
    });
  }

  /**
   * Find an existing topic that should absorb the incoming topic.
   *
   * Semantic distance is the arbiter: lower cosine distance means closer
   * topics, and candidates at or below `threshold` are mergeable. Exact title
   * matches stay as a fast path, mainly for in-batch writes whose embeddings
   * may not be indexed yet.
   */
  public async findMergeCandidate(params: {
    incoming: Pick<ExtractedTopicData, "title"> &
      Partial<Pick<ExtractedTopicData, "content">>;
    threshold: number;
    searchLimit?: number;
    additionalCandidates?: TopicEntity[];
    targetVisibility?: ContentVisibility;
  }): Promise<TopicMergeCandidate | null> {
    const targetVisibility = params.targetVisibility ?? "public";
    const incomingTopicId = this.getTopicIdForTitle(
      params.incoming.title,
      targetVisibility,
    );

    let best: TopicMergeCandidate | null = null;
    const consideredIds = new Set<string>();
    const consider = (
      topic: TopicEntity,
      score: number,
    ): TopicMergeCandidate | null => {
      if (topic.visibility !== targetVisibility) return null;
      if (consideredIds.has(topic.id)) return best;
      consideredIds.add(topic.id);
      const { title } = this.adapter.parseTopicBody(topic.content);
      const candidate = { topic, title, score };
      if (!best || candidate.score > best.score) {
        best = candidate;
      }
      return candidate;
    };

    for (const topic of params.additionalCandidates ?? []) {
      if (topic.id === incomingTopicId) {
        consider(topic, 1);
      }
    }

    const query = [params.incoming.title, params.incoming.content]
      .filter(
        (part): part is string =>
          typeof part === "string" && part.trim().length > 0,
      )
      .join("\n\n");
    const distanceResults = await this.entityService.searchWithDistances({
      query,
    });

    for (const result of distanceResults) {
      if (result.entityType !== TOPIC_ENTITY_TYPE) continue;
      const topic = await this.getTopic(result.entityId, targetVisibility);
      if (!topic) continue;

      const isExactTitle = topic.id === incomingTopicId;
      if (!isExactTitle && result.distance > params.threshold) continue;

      const score = isExactTitle ? 1 : 1 - result.distance;
      consider(topic, score);
    }

    return best;
  }

  public async applySynthesizedMerge(params: {
    existingId: string;
    synthesized: {
      title: string;
      content: string;
    };
    visibility?: ContentVisibility;
  }): Promise<TopicEntity | null> {
    const visibility = params.visibility ?? "public";
    const existing = await this.getTopic(params.existingId, visibility);
    if (!existing) return null;

    return this.updateTopic(
      params.existingId,
      {
        title: params.synthesized.title,
        content: params.synthesized.content,
      },
      visibility,
    );
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
    visibility: ContentVisibility = "public",
  ): Promise<TopicEntity | null> {
    const topics = await Promise.all(
      topicIds.map((id) => this.getTopic(id, visibility)),
    );
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

    const merged = await this.updateTopic(
      target.id,
      {
        content: mergedContent,
      },
      visibility,
    );

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
