import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { z } from "@brains/utils";
import type { OpportunityEntity } from "../schemas/opportunity";
import {
  buildOpportunityFocus,
  suggestOpportunityStates,
  type FocusedOpportunity,
  type OpportunityStateSuggestion,
} from "../lib/opportunity-focus";
import {
  rankOpportunities,
  type OpportunityRankingOptions,
} from "../lib/opportunity-ranking";

const opportunityFocusQuerySchema = z.object({
  entityType: z.literal("opportunity").optional(),
  query: z
    .object({
      now: z.string().optional(),
    })
    .optional(),
});

export interface OpportunityFocusData {
  focus: FocusedOpportunity[];
  suggestions: OpportunityStateSuggestion[];
  totalCount: number;
}

export class OpportunityFocusDataSource implements DataSource {
  public readonly id = "business_development_focus";
  public readonly name = "Business Development Opportunity Focus DataSource";
  public readonly description =
    "Fetches opportunities and returns focus recommendations plus state suggestions";

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = opportunityFocusQuerySchema.parse(query);
    const opportunities =
      await context.entityService.listEntities<OpportunityEntity>({
        entityType: "opportunity",
        options: { limit: 1000 },
      });
    const openOpportunities = opportunities.filter(
      (opportunity) => opportunity.metadata.state !== "closed",
    );
    const rankingOptions: OpportunityRankingOptions = {
      ...(params.query?.now ? { now: params.query.now } : {}),
    };
    const ranked = rankOpportunities(openOpportunities, rankingOptions);

    return outputSchema.parse({
      focus: buildOpportunityFocus(ranked),
      suggestions: suggestOpportunityStates(ranked),
      totalCount: ranked.length,
    } satisfies OpportunityFocusData);
  }
}
