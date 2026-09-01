import {
  defineEntity,
  defineDataSource,
  type EntityDefinition,
} from "@brains/sdk/entities";
import {
  defineServicePlugin,
  defineSubscription,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { ENTITY_CHANNELS } from "@brains/contracts";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
  siteInfoBodySchema,
  type ResolvedSiteInfoBody,
  type SiteInfoBody,
} from "@brains/site-composition";

const SITE_INFO_TYPE = "site-info";

/** Everything a site falls back to before anyone has configured one. */
const DEFAULT_SITE_INFO: ResolvedSiteInfoBody = {
  represents: "anchor",
  title: "Brain",
  description: "A knowledge management system",
};

/**
 * The site's own metadata: title, description, CTA.
 *
 * A singleton whose fields all live in frontmatter — the default codec maps
 * frontmatter to metadata, which is exactly this shape, so no custom
 * markdown codec is needed. Guidance is configuration rather than content,
 * so it stays out of embeddings and projections.
 */
export const siteInfo: EntityDefinition<
  typeof SITE_INFO_TYPE,
  typeof siteInfoBodySchema
> = defineEntity({
  type: SITE_INFO_TYPE,
  purpose: "Singleton configuration describing the published site.",
  metadata: siteInfoBodySchema,
  config: {
    embeddable: false,
    projectionSource: false,
    projectionSourceRole: "excluded",
  },
  // Present before anyone edits one, but only after the initial content
  // sync, so a synced site-info wins over the default.
  seed: {
    on: "content-sync-completed",
    id: SITE_INFO_TYPE,
    content: () => "",
    metadata: { represents: "anchor" },
  },
  dataSources: [
    defineDataSource({
      id: "entities",
      name: "Site Info DataSource",
      description:
        "Provides website channel metadata such as title, description, and CTA",
      fetch: async (_query, entities) => {
        const entity = await entities.getEntity({
          entityType: SITE_INFO_TYPE,
          id: SITE_INFO_TYPE,
        });
        const body = entity
          ? siteInfoBodySchema.parse(entity.metadata)
          : DEFAULT_SITE_INFO;
        return {
          ...body,
          title: body.title ?? DEFAULT_SITE_INFO.title,
          description: body.description ?? DEFAULT_SITE_INFO.description,
          copyright: body.copyright ?? "Powered by Rizom",
        };
      },
    }),
  ],
});

/**
 * Fill in what the site did not say for itself.
 *
 * A site with no title of its own is titled after whoever it represents —
 * the brain, or the anchor it belongs to.
 */
export function resolveIdentityFallbacks(
  body: SiteInfoBody,
  identity: {
    get(): { name: string; purpose: string };
    getProfile(): { name: string; description?: string | undefined };
  },
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

const siteInfoPackage: ServicePackageDefinition<
  z.ZodObject<Record<never, never>>
> = defineServicePlugin({
  // Not "site-info": the entity type owns that name, and both plugins
  // scope to the package. This half answers questions about the site.
  id: "site-metadata",
  config: z.object({}),
  setup: () => ({}),
  entities: [siteInfo],

  subscriptions: () => [
    // What the site is called, answered live rather than cached: an
    // operator editing the singleton expects the next build to see it.
    defineSubscription({
      topic: SITE_METADATA_GET_CHANNEL,
      payload: z.object({}).loose(),
      handle: async ({ entities, identity }) => {
        const entity = await entities.getEntity({
          entityType: SITE_INFO_TYPE,
          id: SITE_INFO_TYPE,
        });
        const body = entity
          ? siteInfoBodySchema.parse(entity.metadata)
          : { represents: "anchor" as const };
        return resolveIdentityFallbacks(body, identity);
      },
    }),

    // A change to the singleton has to reach whatever is already
    // rendering from it; the entity channel says something changed, not
    // what it now means.
    defineSubscription({
      topic: ENTITY_CHANNELS.updated,
      payload: z.object({ entityType: z.string() }).loose(),
      handle: async ({ payload, entities, identity, messaging }) => {
        if (payload.entityType !== SITE_INFO_TYPE) return;
        const entity = await entities.getEntity({
          entityType: SITE_INFO_TYPE,
          id: SITE_INFO_TYPE,
        });
        const body = entity
          ? siteInfoBodySchema.parse(entity.metadata)
          : { represents: "anchor" as const };
        await messaging.send({
          type: SITE_METADATA_UPDATED_CHANNEL,
          payload: resolveIdentityFallbacks(body, identity),
        });
      },
    }),
  ],
});

export default siteInfoPackage;
