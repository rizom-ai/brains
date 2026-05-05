import type {
  Plugin,
  EntityPluginContext,
  EntityTypeConfig,
  DataSource,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
} from "@brains/site-composition";
import {
  siteInfoSchema,
  type SiteInfoEntity,
  type SiteInfoBody,
} from "./schemas/site-info-schema";
import { SiteInfoAdapter } from "./adapters/site-info-adapter";
import { SiteInfoService } from "./services/site-info-service";
import { SiteInfoDataSource } from "./datasources/site-info-datasource";
import packageJson from "../package.json";

const siteInfoAdapter = new SiteInfoAdapter();

/**
 * Site-info EntityPlugin — manages the site's metadata (title, description, CTA, etc.).
 *
 * Singleton entity (id: "site-info"). Created with defaults on first boot.
 * Zero tools — edited via system_update or CMS.
 */
export class SiteInfoPlugin extends EntityPlugin<SiteInfoEntity> {
  readonly entityType = "site-info";
  readonly schema = siteInfoSchema;
  readonly adapter = siteInfoAdapter;

  private defaultSiteInfo: Partial<SiteInfoBody>;

  constructor(config?: { siteInfo?: Partial<SiteInfoBody> }) {
    super("site-info", packageJson);
    this.defaultSiteInfo = config?.siteInfo ?? {};
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { embeddable: false };
  }

  protected override getDataSources(): DataSource[] {
    return [new SiteInfoDataSource(this.logger.child("SiteInfoDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    const service = SiteInfoService.createFresh(
      context.entityService,
      this.logger,
      this.defaultSiteInfo,
    );

    context.messaging.subscribe(SITE_METADATA_GET_CHANNEL, async () => {
      const siteInfo = await service.getSiteInfo();
      return { success: true, data: siteInfo };
    });

    context.messaging.subscribe("entity:updated", async (message) => {
      const payload = message.payload as { entityType: string };
      if (payload.entityType === "site-info") {
        const siteInfo = await service.getSiteInfo();
        await context.messaging.send({
          type: SITE_METADATA_UPDATED_CHANNEL,
          payload: siteInfo,
          broadcast: true,
        });
      }
      return { success: true };
    });

    // Create default entity after seed content is imported
    context.messaging.subscribe("sync:initial:completed", async () => {
      await service.initialize();
      return { success: true };
    });
  }
}

export function siteInfoPlugin(config?: {
  siteInfo?: Partial<SiteInfoBody>;
}): Plugin {
  return new SiteInfoPlugin(config);
}
