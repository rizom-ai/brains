import type { DataSource, BaseDataSourceContext } from "@brains/entity-service";
import type { Logger } from "@brains/utils";
import { type z as zType } from "@brains/utils";
import { SiteInfoAdapter } from "../adapters/site-info-adapter";
import type { SiteInfoBody } from "../schemas/site-info-schema";

const adapter = new SiteInfoAdapter();

/**
 * DataSource for site-info entity data.
 * Returns site-info body + profile socialLinks — both from entityService.
 * Navigation is NOT included — layouts get that from site-builder's NavigationDataSource.
 */
export class SiteInfoDataSource implements DataSource {
  public readonly id = "site-info:entities";
  public readonly name = "Site Info DataSource";
  public readonly description =
    "Provides site metadata (title, description, CTA) and profile social links";

  constructor(private readonly logger: Logger) {}

  async fetch<T>(
    _query: unknown,
    outputSchema: zType.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { entityService } = context;

    // Get site info from entity
    let siteInfoBody: SiteInfoBody;
    try {
      const entity = await entityService.getEntity("site-info", "site-info");
      siteInfoBody = entity
        ? adapter.parseSiteInfoBody(entity.content)
        : {
            title: "Brain",
            description: "A knowledge management system",
          };
    } catch {
      siteInfoBody = {
        title: "Brain",
        description: "A knowledge management system",
      };
    }

    // Get profile socialLinks from entity
    let socialLinks:
      | Array<{ platform: string; url: string; label?: string }>
      | undefined;
    try {
      const profileEntity = await entityService.getEntity(
        "anchor-profile",
        "anchor-profile",
      );
      if (profileEntity) {
        const metadata = profileEntity.metadata as Record<string, unknown>;
        socialLinks = metadata["socialLinks"] as typeof socialLinks;
      }
    } catch {
      // Profile not available
    }

    const siteInfo = {
      ...siteInfoBody,
      socialLinks,
      copyright: siteInfoBody.copyright ?? "Powered by Rizom",
    };

    this.logger.debug("SiteInfoDataSource returning", {
      title: siteInfo.title,
      hasSocialLinks: !!siteInfo.socialLinks,
    });

    return outputSchema.parse(siteInfo);
  }
}
