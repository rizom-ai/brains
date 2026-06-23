import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { z } from "@brains/utils";
import type { OpportunityEntity } from "../schemas/opportunity";
import {
  rankOpportunities,
  type OpportunityRankingOptions,
  type RankedOpportunity,
} from "../lib/opportunity-ranking";

const opportunityStackQuerySchema = z.object({
  entityType: z.literal("opportunity").optional(),
  query: z
    .object({
      includeClosed: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
      now: z.string().optional(),
    })
    .optional(),
});

export interface OpportunityStackData {
  opportunities: RankedOpportunity[];
  totalCount: number;
}

export class OpportunityStackDataSource implements DataSource {
  public readonly id = "business_development_stack";
  public readonly name = "Business Development Opportunity Stack DataSource";
  public readonly description =
    "Fetches opportunity entities and returns a ranked priority stack";

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = opportunityStackQuerySchema.parse(query);
    const opportunities =
      await context.entityService.listEntities<OpportunityEntity>({
        entityType: "opportunity",
        options: { limit: 1000 },
      });

    const openOpportunities = params.query?.includeClosed
      ? opportunities
      : opportunities.filter(
          (opportunity) => opportunity.metadata.state !== "closed",
        );
    const rankingOptions: OpportunityRankingOptions = {
      ...(params.query?.now ? { now: params.query.now } : {}),
    };
    const ranked = rankOpportunities(openOpportunities, rankingOptions);
    const limited = params.query?.limit
      ? ranked.slice(0, params.query.limit)
      : ranked;

    return outputSchema.parse({
      opportunities: limited,
      totalCount: ranked.length,
    } satisfies OpportunityStackData);
  }
}
