import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { SiteInfoAdapter } from "../adapters/site-info-adapter";
import type { SiteInfoBody } from "../schemas/site-info-schema";

const adapter = new SiteInfoAdapter();

/**
 * DataSource for site-info entity data.
 * Returns website-only channel configuration from the site-info entity.
 * Identity and social links are composed by site-builder, not owned here.
 * Navigation is NOT included — layouts get that from site-builder's NavigationDataSource.
 */
export class SiteInfoDataSource implements DataSource {
  private readonly logger: Logger;
  public readonly id = "site-info:entities";
  public readonly name = "Site Info DataSource";
  public readonly description =
    "Provides website channel metadata such as title, description, and CTA";

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { entityService } = context;

    // Get site info from entity
    let siteInfoBody: SiteInfoBody;
    try {
      const entity = await entityService.getEntity({
        entityType: "site-info",
        id: "site-info",
      });
      siteInfoBody = entity
        ? adapter.parseSiteInfoBody(entity.content)
        : {
            represents: "anchor",
            title: "Brain",
            description: "A knowledge management system",
          };
    } catch {
      siteInfoBody = {
        represents: "anchor",
        title: "Brain",
        description: "A knowledge management system",
      };
    }

    const siteInfo = {
      ...siteInfoBody,
      title: siteInfoBody.title ?? "Brain",
      description: siteInfoBody.description ?? "A knowledge management system",
      copyright: siteInfoBody.copyright ?? "Powered by Rizom",
    };

    this.logger.debug("SiteInfoDataSource returning", {
      title: siteInfo.title,
    });

    return outputSchema.parse(siteInfo);
  }
}
