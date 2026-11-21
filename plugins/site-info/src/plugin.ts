import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  SYSTEM_CHANNELS,
  entityUpdatedChannel,
  serviceRuntime,
  withOwnedDataSources,
  type ServiceIdentity,
} from "@brains/sdk/internal/service-runtime";
import {
  siteInfoBodySchema,
  siteMetadataContract,
  siteMetadataUpdatedChannel,
  type ResolvedSiteInfoBody,
  type SiteInfoBody,
} from "@brains/site-composition";

import {
  SITE_INFO,
  siteInfoDefinition,
  type SiteInfoDefinition,
} from "./site-info-entity";

/** What a site falls back to before anyone has configured one. */
const PLACEHOLDER_SITE_INFO = {
  represents: "anchor",
  title: "Brain",
  description: "A knowledge management system",
} as const;

/** The site-info type in the form this release writes. */
export const siteInfo: SiteInfoDefinition = siteInfoDefinition();

/**
 * Website-only channel configuration from the site-info record, read at the
 * build's scope. Identity and social links are composed by site-builder,
 * not owned here, and navigation comes from its own data source.
 */
const siteInfoDataSourceFor = (
  siteInfo: SiteInfoDefinition,
): DataSourceDefinition =>
  defineDataSource({
    id: "entities",
    name: "Site Info DataSource",
    description:
      "Provides website channel metadata such as title, description, and CTA",
    fetch: async (_query, entities) => {
      // The site must still build before its site-info record exists, so the
      // placeholder is the first-run answer as well as the error one.
      const body: SiteInfoBody = await entities
        .get(siteInfo, SITE_INFO)
        .then((record) => record?.metadata ?? PLACEHOLDER_SITE_INFO)
        .catch(() => PLACEHOLDER_SITE_INFO);
      return {
        ...body,
        title: body.title ?? PLACEHOLDER_SITE_INFO.title,
        description: body.description ?? PLACEHOLDER_SITE_INFO.description,
        copyright: body.copyright ?? "Powered by Rizom",
      };
    },
  });

/** The site-info a brain starts with, before anyone writes one. */
const defaultSiteInfoSchema: ReturnType<typeof siteInfoBodySchema.partial> =
  siteInfoBodySchema.partial();

const siteInfoConfigSchema: z.ZodObject<{
  siteInfo: z.ZodOptional<typeof defaultSiteInfoSchema>;
}> = z.object({
  siteInfo: defaultSiteInfoSchema.optional(),
});

export type SiteInfoConfig = z.output<typeof siteInfoConfigSchema>;
export type SiteInfoConfigInput = z.input<typeof siteInfoConfigSchema>;

/**
 * Fill in what the site did not say for itself: a site with no title of
 * its own is titled after whoever it represents, the brain or its anchor.
 */
export function resolveIdentityFallbacks(
  body: SiteInfoBody,
  identity: ServiceIdentity,
): ResolvedSiteInfoBody {
  if (body.represents === "brain") {
    const brain = identity.get();
    return {
      ...body,
      title: body.title ?? brain.name,
      description: body.description ?? brain.purpose,
    };
  }
  const anchor = identity.getProfile();
  return {
    ...body,
    title: body.title ?? anchor.name,
    description:
      body.description ??
      anchor.description ??
      `The public site for ${anchor.name}`,
  };
}

/**
 * Site-info: the site-info type, the `site-info:entities` data source site
 * layouts read, and the service that answers for the site's metadata and
 * announces when it changes.
 */
const siteInfoService = defineServicePlugin(
  {
    // Not "site-info": the type the service owns is installed under that id.
    id: "site-metadata",
    config: siteInfoConfigSchema,
    entities: [siteInfo],
  },
  {
    subscriptions: (context) => {
      const { config, entities, messaging } = context;
      const runtime = serviceRuntime(context);
      const { logger } = runtime;
      const defaults: SiteInfoBody = siteInfoBodySchema.parse({
        represents: "anchor",
        ...config.siteInfo,
      });

      /**
       * The site's metadata as it stands, from the database every time so
       * an edit reaches the next build. Read as a class read it, at public
       * scope: a record only some may see does not set the public site.
       */
      const currentSiteInfo = async (): Promise<ResolvedSiteInfoBody> => {
        try {
          const record = await entities.get(siteInfo, SITE_INFO);
          if (record?.visibility === "public") {
            return resolveIdentityFallbacks(record.metadata, runtime.identity);
          }
        } catch (error) {
          logger.debug("Site info not found, using defaults", { error });
        }
        return resolveIdentityFallbacks(defaults, runtime.identity);
      };

      // Answered in every process: the worker builds the site.
      runtime.answer(siteMetadataContract, () => currentSiteInfo(), {
        everyProcess: true,
      });

      // Observed: a site-info change synced by the worker refreshes this
      // process's metadata too.
      runtime.listen(
        entityUpdatedChannel,
        async ({ payload }) => {
          if (payload.entityType !== SITE_INFO) return;
          await messaging.publish(
            siteMetadataUpdatedChannel,
            await currentSiteInfo(),
          );
        },
        { mode: "observe" },
      );

      // The default record, once seed content is imported, unless an import
      // already wrote one.
      runtime.listen(SYSTEM_CHANNELS.initialSyncCompleted, async () => {
        try {
          if (await entities.get(siteInfo, SITE_INFO)) return;
          logger.info("No site info found, creating default site info");
          await entities.create(siteInfo, {
            id: SITE_INFO,
            content: "",
            metadata: defaults,
          });
          logger.info("Default site info created successfully");
        } catch (error) {
          logger.error("Failed to initialize site info", { error });
        }
      });
      return [];
    },
  },
);

const siteInfoPackage: ServicePackageDefinition<z.ZodType<object, object>> =
  withOwnedDataSources(siteInfoService, [siteInfoDataSourceFor(siteInfo)]);

export default siteInfoPackage;
