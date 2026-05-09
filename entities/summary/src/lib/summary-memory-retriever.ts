import type { EntityPluginContext } from "@brains/plugins";
import type { SummaryEntity } from "../schemas/summary";
import { SUMMARY_ENTITY_TYPE } from "./constants";
import { getConversationSpaceId } from "./summary-space-eligibility";

const DEFAULT_MEMORY_LIMIT = 5;
const CANDIDATE_MULTIPLIER = 4;

export interface RetrieveSummaryMemoryInput {
  query?: string | undefined;
  conversationId?: string | undefined;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
  limit?: number | undefined;
  includeOtherSpaces?: boolean | undefined;
}

export interface RetrievedSummaryMemory {
  id: string;
  conversationId: string;
  spaceId: string;
  channelId: string;
  channelName?: string;
  interfaceType: string;
  updated: string;
  messageCount: number;
  entryCount: number;
  score: number;
  excerpt: string;
}

export interface RetrieveSummaryMemoryResult {
  query: string;
  spaceId?: string;
  results: RetrievedSummaryMemory[];
}

interface SummaryCandidate {
  summary: SummaryEntity;
  score: number;
  excerpt: string;
}

export class SummaryMemoryRetriever {
  constructor(private readonly context: EntityPluginContext) {}

  public async retrieve(
    input: RetrieveSummaryMemoryInput,
  ): Promise<RetrieveSummaryMemoryResult> {
    const query = input.query?.trim() ?? "";
    const limit = Math.max(1, input.limit ?? DEFAULT_MEMORY_LIMIT);
    const spaceId = await this.resolveSpaceId(input);
    const candidates = await this.loadCandidates(query, limit);

    const scopedCandidates = candidates.filter((candidate) => {
      if (!spaceId || input.includeOtherSpaces) return true;
      return this.getSummarySpaceId(candidate.summary) === spaceId;
    });

    const ranked = scopedCandidates
      .sort((left, right) => {
        const leftSameSpace = spaceId
          ? this.getSummarySpaceId(left.summary) === spaceId
          : false;
        const rightSameSpace = spaceId
          ? this.getSummarySpaceId(right.summary) === spaceId
          : false;
        if (leftSameSpace !== rightSameSpace) return leftSameSpace ? -1 : 1;
        if (right.score !== left.score) return right.score - left.score;
        return (
          Date.parse(right.summary.updated) - Date.parse(left.summary.updated)
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
    input: RetrieveSummaryMemoryInput,
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
  ): Promise<SummaryCandidate[]> {
    const candidateLimit = limit * CANDIDATE_MULTIPLIER;

    if (query.length > 0) {
      const results = await this.context.entityService.search<SummaryEntity>({
        query,
        options: {
          types: [SUMMARY_ENTITY_TYPE],
          limit: candidateLimit,
        },
      });
      return results.map((result) => ({
        summary: result.entity,
        score: result.score,
        excerpt: result.excerpt,
      }));
    }

    const summaries =
      await this.context.entityService.listEntities<SummaryEntity>({
        entityType: SUMMARY_ENTITY_TYPE,
        options: {
          limit: candidateLimit,
          sortFields: [{ field: "updated", direction: "desc" }],
        },
      });

    return summaries.map((summary) => ({
      summary,
      score: 0,
      excerpt: this.buildFallbackExcerpt(summary),
    }));
  }

  private toMemory(candidate: SummaryCandidate): RetrievedSummaryMemory {
    const { summary } = candidate;
    return {
      id: summary.id,
      conversationId: summary.metadata.conversationId,
      spaceId: this.getSummarySpaceId(summary),
      channelId: summary.metadata.channelId,
      ...(summary.metadata.channelName
        ? { channelName: summary.metadata.channelName }
        : {}),
      interfaceType: summary.metadata.interfaceType,
      updated: summary.updated,
      messageCount: summary.metadata.messageCount,
      entryCount: summary.metadata.entryCount,
      score: candidate.score,
      excerpt: candidate.excerpt || this.buildFallbackExcerpt(summary),
    };
  }

  private getSummarySpaceId(summary: SummaryEntity): string {
    return `${summary.metadata.interfaceType}:${summary.metadata.channelId}`;
  }

  private buildFallbackExcerpt(summary: SummaryEntity): string {
    return (
      summary.content
        .replace(/^---[\s\S]*?---\s*/m, "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("#")) ?? ""
    );
  }
}
