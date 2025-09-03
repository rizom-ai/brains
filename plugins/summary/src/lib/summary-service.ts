import type { IEntityService } from "@brains/plugins";
import type { SummaryEntity } from "../schemas/summary";

/**
 * Core service for summary operations
 * Centralizes business logic for summary management
 */
export class SummaryService {
  constructor(private entityService: IEntityService) {}

  /**
   * Get summary for a conversation
   */
  async getSummary(conversationId: string): Promise<SummaryEntity | null> {
    const summaryId = `summary-${conversationId}`;

    try {
      return await this.entityService.getEntity<SummaryEntity>(
        "summary",
        summaryId,
      );
    } catch {
      return null;
    }
  }

  /**
   * Delete summary for a conversation
   */
  async deleteSummary(conversationId: string): Promise<boolean> {
    const summaryId = `summary-${conversationId}`;

    try {
      await this.entityService.deleteEntity("summary", summaryId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all summaries (for management/export purposes)
   */
  async getAllSummaries(): Promise<SummaryEntity[]> {
    try {
      return await this.entityService.listEntities<SummaryEntity>("summary", {
        limit: 1000, // Get all summaries
      });
    } catch {
      return [];
    }
  }

  /**
   * Export summary as markdown
   */
  async exportSummary(conversationId: string): Promise<string | null> {
    const summary = await this.getSummary(conversationId);
    if (!summary) {
      return null;
    }
    return summary.content;
  }

  /**
   * Get summary statistics
   */
  async getStatistics(): Promise<{
    totalSummaries: number;
    totalEntries: number;
    averageEntriesPerSummary: number;
  }> {
    const summaries = await this.getAllSummaries();

    let totalEntries = 0;
    for (const summary of summaries) {
      totalEntries += summary.metadata?.entryCount ?? 0;
    }

    return {
      totalSummaries: summaries.length,
      totalEntries,
      averageEntriesPerSummary:
        summaries.length > 0 ? totalEntries / summaries.length : 0,
    };
  }
}
