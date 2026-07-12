import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { SiteInfoAdapter } from "../adapters/site-info-adapter";
import type { SiteInfoBody } from "../schemas/site-info-schema";

const adapter = new SiteInfoAdapter();

const socialLinkSchema = z
  .looseObject({
    platform: z.string(),
    url: z.string(),
    label: z.string().optional(),
  })
  .transform((link) => ({
    platform: link.platform,
    url: link.url,
    ...(link.label !== undefined ? { label: link.label } : {}),
  }));

const profileMetadataSchema = z.looseObject({
  socialLinks: z.array(socialLinkSchema).optional(),
});

/**
 * DataSource for site-info entity data.
 * Returns site-info body + profile socialLinks — both from entityService.
 * Navigation is NOT included — layouts get that from site-builder's NavigationDataSource.
 */
export class SiteInfoDataSource implements DataSource {
  private readonly logger: Logger;
  public readonly id = "site-info:entities";
  public readonly name = "Site Info DataSource";
  public readonly description =
    "Provides site metadata (title, description, CTA) and profile social links";

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
      Array<{ platform: string; url: string; label?: string }> | undefined;
    try {
      const profileEntity = await entityService.getEntity({
        entityType: "anchor-profile",
        id: "anchor-profile",
      });
      if (profileEntity) {
        const parsed = profileMetadataSchema.safeParse(profileEntity.metadata);
        socialLinks = parsed.success ? parsed.data.socialLinks : undefined;
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
