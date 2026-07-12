import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import type {
  ActionItemEntity,
  DecisionEntity,
} from "../schemas/conversation-memory";
import type { SummaryEntity } from "../schemas/summary";
import { SummaryAdapter } from "../adapters/summary-adapter";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_ENTITY_TYPE,
} from "./constants";
import { getConversationSpaceId } from "./summary-space-eligibility";
import { buildFallbackExcerpt } from "./excerpt";

const DEFAULT_MEMORY_LIMIT = 5;
const CANDIDATE_MULTIPLIER = 4;
const MEMORY_ENTITY_TYPES = [
  SUMMARY_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  ACTION_ITEM_ENTITY_TYPE,
];
const MAX_AGENT_CONTEXT_CONTENT_LENGTH = 1600;
const MAX_SUMMARY_CONTEXT_ENTRIES = 3;
const MAX_SUMMARY_CONTEXT_KEY_POINTS = 5;
const summaryAdapter = new SummaryAdapter();

type ConversationMemorySearchEntity =
  SummaryEntity | DecisionEntity | ActionItemEntity;

export interface RetrieveConversationMemoryInput {
  query?: string | undefined;
  conversationId?: string | undefined;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
  limit?: number | undefined;
  includeOtherSpaces?: boolean | undefined;
  /** Explicit identity filter; does not cross spaces unless includeOtherSpaces is true. */
  actorId?: string | undefined;
  /** Explicit canonical identity filter; does not cross spaces unless includeOtherSpaces is true. */
  canonicalId?: string | undefined;
  /** Caller visibility scope; undefined fails closed in the entity service to public-only. */
  visibilityScope?: ContentVisibility | undefined;
}

export interface RetrievedConversationMemory {
  id: string;
  entityType: "summary" | "decision" | "action-item";
  conversationId: string;
  spaceId: string;
  channelId: string;
  channelName?: string;
  interfaceType: string;
  updated: string;
  visibility: ContentVisibility;
  score: number;
  excerpt: string;
  content: string;
  messageCount?: number;
  entryCount?: number;
  status?: string;
}

export interface RetrieveConversationMemoryResult {
  query: string;
  spaceId?: string;
  results: RetrievedConversationMemory[];
}

interface MemoryCandidate {
  entity: ConversationMemorySearchEntity;
  score: number;
  excerpt: string;
}

export class ConversationMemoryRetriever {
  private readonly context: EntityPluginContext;
  constructor(context: EntityPluginContext) {
    this.context = context;
  }

  public async retrieve(
    input: RetrieveConversationMemoryInput,
  ): Promise<RetrieveConversationMemoryResult> {
    const query = input.query?.trim() ?? "";
    const limit = Math.max(1, input.limit ?? DEFAULT_MEMORY_LIMIT);
    const spaceId = await this.resolveSpaceId(input);
    const candidates = await this.loadCandidates(
      query,
      limit,
      input.visibilityScope,
    );

    const scopedCandidates = candidates
      .filter((candidate) => {
        if (!spaceId || input.includeOtherSpaces) return true;
        return this.getEntitySpaceId(candidate.entity) === spaceId;
      })
      .filter((candidate) => this.matchesIdentity(candidate.entity, input));

    const seen = new Set<string>();
    const ranked = scopedCandidates
      .sort((left, right) => {
        const leftSameSpace = spaceId
          ? this.getEntitySpaceId(left.entity) === spaceId
          : false;
        const rightSameSpace = spaceId
          ? this.getEntitySpaceId(right.entity) === spaceId
          : false;
        if (leftSameSpace !== rightSameSpace) return leftSameSpace ? -1 : 1;
        if (right.score !== left.score) return right.score - left.score;
        return (
          Date.parse(right.entity.updated) - Date.parse(left.entity.updated)
        );
      })
      .filter((candidate) => {
        if (seen.has(candidate.entity.id)) return false;
        seen.add(candidate.entity.id);
        return true;
      })
      .slice(0, limit)
      .map((candidate) => this.toMemory(candidate));

    return {
      query,
      ...(spaceId ? { spaceId } : {}),
      results: ranked,
    };
  }

  private async resolveSpaceId(
    input: RetrieveConversationMemoryInput,
  ): Promise<string | undefined> {
    if (input.interfaceType && input.channelId) {
      return getConversationSpaceId({
        interfaceType: input.interfaceType,
        channelId: input.channelId,
      });
    }

    if (!input.conversationId) return undefined;

    const conversation = await this.context.conversations.get(
      input.conversationId,
    );
    return conversation ? getConversationSpaceId(conversation) : undefined;
  }

  private async loadCandidates(
    query: string,
    limit: number,
    visibilityScope: ContentVisibility | undefined,
  ): Promise<MemoryCandidate[]> {
    const candidateLimit = limit * CANDIDATE_MULTIPLIER;

    if (query.length > 0) {
      const results =
        await this.context.entityService.search<ConversationMemorySearchEntity>(
          {
            query,
            options: {
              types: MEMORY_ENTITY_TYPES,
              limit: candidateLimit,
              ...(visibilityScope ? { visibilityScope } : {}),
            },
          },
        );
      return results.map((result) => ({
        entity: result.entity,
        score: result.score,
        excerpt: result.excerpt,
      }));
    }

    const entityGroups = await Promise.all(
      MEMORY_ENTITY_TYPES.map((entityType) =>
        this.context.entityService.listEntities<ConversationMemorySearchEntity>(
          {
            entityType,
            options: {
              limit: candidateLimit,
              sortFields: [{ field: "updated", direction: "desc" }],
              ...(visibilityScope ? { filter: { visibilityScope } } : {}),
            },
          },
        ),
      ),
    );

    return entityGroups.flat().map((entity) => ({
      entity,
      score: 0,
      excerpt: buildFallbackExcerpt(entity),
    }));
  }

  private toMemory(candidate: MemoryCandidate): RetrievedConversationMemory {
    const { entity } = candidate;
    const metadata = entity.metadata;
    const excerpt = candidate.excerpt || buildFallbackExcerpt(entity);
    return {
      id: entity.id,
      entityType: entity.entityType,
      conversationId: metadata.conversationId,
      spaceId: this.getEntitySpaceId(entity),
      channelId: metadata.channelId,
      ...(metadata.channelName ? { channelName: metadata.channelName } : {}),
      interfaceType: metadata.interfaceType,
      updated: entity.updated,
      visibility: entity.visibility,
      score: candidate.score,
      excerpt,
      content: this.buildContextContent(entity, excerpt),
      ...(entity.entityType === SUMMARY_ENTITY_TYPE
        ? {
            messageCount: entity.metadata.messageCount,
            entryCount: entity.metadata.entryCount,
          }
        : { status: entity.metadata.status }),
    };
  }

  private matchesIdentity(
    entity: ConversationMemorySearchEntity,
    input: Pick<RetrieveConversationMemoryInput, "actorId" | "canonicalId">,
  ): boolean {
    if (!input.actorId && !input.canonicalId) return true;

    return this.getIdentityReferences(entity).some((reference) => {
      if (input.canonicalId && reference.canonicalId === input.canonicalId) {
        return true;
      }
      if (!input.actorId) return false;
      return (
        reference.actorId === input.actorId ||
        reference.sourceActorIds?.includes(input.actorId) === true
      );
    });
  }

  private getIdentityReferences(entity: ConversationMemorySearchEntity): Array<{
    actorId?: string | undefined;
    canonicalId?: string | undefined;
    sourceActorIds?: string[] | undefined;
  }> {
    if (this.isSummaryEntity(entity)) {
      return entity.metadata.participants ?? [];
    }
    if (this.isDecisionEntity(entity)) {
      return [
        ...(entity.metadata.decidedBy ?? []),
        ...(entity.metadata.mentionedBy ?? []),
      ];
    }
    return [
      ...(entity.metadata.assignedTo ?? []),
      ...(entity.metadata.requestedBy ?? []),
    ];
  }

  private buildContextContent(
    entity: ConversationMemorySearchEntity,
    excerpt: string,
  ): string {
    if (!this.isSummaryEntity(entity)) return excerpt;

    const entries = summaryAdapter.parseBody(entity.content).entries;
    const content = entries
      .slice(0, MAX_SUMMARY_CONTEXT_ENTRIES)
      .map((entry) => {
        const lines = [entry.title, entry.summary.trim()];
        if (entry.keyPoints.length > 0) {
          lines.push(
            ...entry.keyPoints
              .slice(0, MAX_SUMMARY_CONTEXT_KEY_POINTS)
              .map((point) => `- ${point}`),
          );
        }
        return lines.join("\n");
      })
      .join("\n\n");

    return this.truncateContent(
      content || excerpt || buildFallbackExcerpt(entity),
    );
  }

  private truncateContent(content: string): string {
    if (content.length <= MAX_AGENT_CONTEXT_CONTENT_LENGTH) return content;
    const slice = content.slice(0, MAX_AGENT_CONTEXT_CONTENT_LENGTH - 1);
    // Break at the last whitespace so we never cut a word mid-token; fall back
    // to a hard cut only when a single token exceeds the limit.
    const lastBreak = slice.search(/\s\S*$/);
    const truncated = lastBreak > 0 ? slice.slice(0, lastBreak) : slice;
    return `${truncated.trimEnd()}…`;
  }

  private isSummaryEntity(
    entity: ConversationMemorySearchEntity,
  ): entity is SummaryEntity {
    return entity.entityType === SUMMARY_ENTITY_TYPE;
  }

  private isDecisionEntity(
    entity: ConversationMemorySearchEntity,
  ): entity is DecisionEntity {
    return entity.entityType === DECISION_ENTITY_TYPE;
  }

  private getEntitySpaceId(entity: ConversationMemorySearchEntity): string {
    const metadata = entity.metadata;
    if ("spaceId" in metadata && typeof metadata.spaceId === "string") {
      return metadata.spaceId;
    }
    return getConversationSpaceId(metadata);
  }
}
