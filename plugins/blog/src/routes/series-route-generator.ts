import type { IEntityService, Logger } from "@brains/plugins";
import { slugify } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";

/**
 * Route definition matching site-builder's structure
 */
export interface SeriesRouteDefinition {
  id: string;
  path: string;
  title: string;
  description: string;
  layout: string;
  sections: Array<{
    id: string;
    template: string;
    dataQuery: Record<string, unknown>;
  }>;
  sourceEntityType: string;
}

/**
 * Generates routes for series list and detail pages
 * - /series - list of all series
 * - /series/{slug} - posts in a specific series
 */
export class SeriesRouteGenerator {
  constructor(
    private readonly entityService: IEntityService,
    private readonly logger: Logger,
  ) {}

  /**
   * Generate all series routes (list + detail for each series)
   */
  async generateRoutes(): Promise<SeriesRouteDefinition[]> {
    const routes: SeriesRouteDefinition[] = [];

    // Add series list route
    routes.push({
      id: "series-list",
      path: "/series",
      title: "Series",
      description: "Browse all series",
      layout: "default",
      sections: [
        {
          id: "list",
          template: "blog:series-list",
          dataQuery: { type: "list" },
        },
      ],
      sourceEntityType: "post",
    });

    // Get unique series names for detail routes
    const seriesNames = await this.getUniqueSeriesNames();

    if (seriesNames.length === 0) {
      this.logger.debug("No series found in posts");
      return routes;
    }

    this.logger.debug(`Found ${seriesNames.length} unique series`, {
      series: seriesNames,
    });

    // Add detail route for each series
    for (const seriesName of seriesNames) {
      const slug = slugify(seriesName);
      routes.push({
        id: `series-detail-${slug}`,
        path: `/series/${slug}`,
        title: `Series: ${seriesName}`,
        description: `Posts in the ${seriesName} series`,
        layout: "default",
        sections: [
          {
            id: "detail",
            template: "blog:series-detail",
            dataQuery: { type: "detail", seriesName },
          },
        ],
        sourceEntityType: "post",
      });
    }

    return routes;
  }

  /**
   * Get all unique series names from posts
   */
  private async getUniqueSeriesNames(): Promise<string[]> {
    const posts = await this.entityService.listEntities<BlogPost>("post", {});

    const seriesNames = new Set<string>();
    for (const post of posts) {
      if (post.metadata.seriesName) {
        seriesNames.add(post.metadata.seriesName);
      }
    }

    return Array.from(seriesNames);
  }
}
