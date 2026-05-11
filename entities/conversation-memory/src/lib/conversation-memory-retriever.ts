import type { EntityPluginContext } from "@brains/plugins";
import type {
  ActionItemEntity,
  DecisionEntity,
} from "../schemas/conversation-memory";
import type { SummaryEntity } from "../schemas/summary";
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

type ConversationMemorySearchEntity =
  | SummaryEntity
  | DecisionEntity
  | ActionItemEntity;

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
  score: number;
  excerpt: string;
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
  constructor(private readonly context: EntityPluginContext) {}

  public async retrieve(
    input: RetrieveConversationMemoryInput,
  ): Promise<RetrieveConversationMemoryResult> {
    const query = input.query?.trim() ?? "";
    const limit = Math.max(1, input.limit ?? DEFAULT_MEMORY_LIMIT);
    const spaceId = await this.resolveSpaceId(input);
    const candidates = await this.loadCandidates(query, limit);

    const scopedCandidates = candidates
      .filter((candidate) => {
        if (!spaceId || input.includeOtherSpaces) return true;
        return this.getEntitySpaceId(candidate.entity) === spaceId;
      })
      .filter((candidate) => this.matchesIdentity(candidate.entity, input));

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
      return `${input.interfaceType}:${input.channelId}`;
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
    return {
      id: entity.id,
      entityType: entity.entityType,
      conversationId: metadata.conversationId,
      spaceId: this.getEntitySpaceId(entity),
      channelId: metadata.channelId,
      ...(metadata.channelName ? { channelName: metadata.channelName } : {}),
      interfaceType: metadata.interfaceType,
      updated: entity.updated,
      score: candidate.score,
      excerpt: candidate.excerpt || buildFallbackExcerpt(entity),
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
    return `${metadata.interfaceType}:${metadata.channelId}`;
  }
}
