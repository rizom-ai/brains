import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { z } from "@brains/utils";
import {
  RELAY_HOME_DIAGRAM_FALLBACK,
  parseRelayDiagramContent,
  relayDiagramBaseContentSchema,
  relayHomeCountsSchema,
  type RelayDiagramBaseContent,
  type RelayHomeCounts,
} from "./home-diagram-content";

const querySchema = z
  .object({
    query: z
      .object({
        routeId: z.string().default("home"),
        sectionId: z.string().default("diagram"),
      })
      .default({ routeId: "home", sectionId: "diagram" }),
  })
  .passthrough();

const countEntityTypes = {
  captures: "base",
  links: "link",
  topics: "topic",
  summaries: "summary",
  peers: "agent",
} as const satisfies Record<keyof RelayHomeCounts, string>;

export class RelayHomeCountsDataSource implements DataSource {
  public readonly id = "relay-site:home-counts";
  public readonly name = "Relay homepage counts";
  public readonly description =
    "Fetches Relay homepage content and live entity counts for the system diagram";

  public async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const input = querySchema.parse(query ?? {});
    const content = await this.fetchContent(
      context,
      input.query.routeId,
      input.query.sectionId,
    );
    const counts = await this.fetchCounts(context);

    return outputSchema.parse({
      ...content,
      counts,
    });
  }

  private async fetchContent(
    context: BaseDataSourceContext,
    routeId: string,
    sectionId: string,
  ): Promise<RelayDiagramBaseContent> {
    const entity = await context.entityService.getEntity({
      entityType: "site-content",
      id: `${routeId}:${sectionId}`,
    });

    if (!entity?.content) {
      return RELAY_HOME_DIAGRAM_FALLBACK;
    }

    return relayDiagramBaseContentSchema.parse(
      parseRelayDiagramContent(entity.content),
    );
  }

  private async fetchCounts(
    context: BaseDataSourceContext,
  ): Promise<RelayHomeCounts> {
    const entries = await Promise.all(
      Object.entries(countEntityTypes).map(async ([key, entityType]) => [
        key,
        await this.countOrZero(context, entityType),
      ]),
    );

    return relayHomeCountsSchema.parse(Object.fromEntries(entries));
  }

  private async countOrZero(
    context: BaseDataSourceContext,
    entityType: string,
  ): Promise<number> {
    if (!context.entityService.hasEntityType(entityType)) {
      return 0;
    }

    try {
      return await context.entityService.countEntities({ entityType });
    } catch {
      return 0;
    }
  }
}
