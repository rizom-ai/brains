import {
  extractCoverImageId,
  extractOgImageId,
  extractMarkdownImages,
} from "@brains/image";
import { EntityUrlGenerator } from "@brains/site-composition";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { pluralize } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import type { SiteImageLookup } from "@brains/site-engine";
import type { ServiceEntityService } from "@brains/plugins";
import type { BuildPipelineContext } from "./build-pipeline-context";

const entityWithSlugSchema: z.ZodObject<
  {
    id: z.ZodString;
    entityType: z.ZodString;
    content: z.ZodString;
    metadata: z.ZodObject<{ slug: z.ZodString }, z.core.$loose>;
  },
  z.core.$loose
> = z.looseObject({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  metadata: z.looseObject({
    slug: z.string(),
  }),
});

type EntityWithSlug = z.output<typeof entityWithSlugSchema>;

// Type for enriched entity with url, typeLabel, listUrl, and listLabel
export interface EnrichedEntity extends EntityWithSlug {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
  coverImageUrl?: string | undefined;
  ogImageUrl?: string | undefined;
  coverImageWidth?: number | undefined;
  coverImageHeight?: number | undefined;
  coverImageSrcset?: string | undefined;
  coverImageSizes?: string | undefined;
}

export interface ContentEnrichmentOptions {
  pipelineContext: Pick<BuildPipelineContext, "services" | "entityDisplay">;
  imageBuildService?: SiteImageLookup | null | undefined;
  urlGenerator?: EntityUrlGenerator | undefined;
  siteUrl?: string | undefined;
}

/**
 * Auto-enrich data with URL, typeLabel, and coverImageUrl fields.
 * Recursively traverses data and adds url/typeLabel/coverImageUrl to any entity objects.
 */
export async function enrichWithUrls(
  data: unknown,
  options: ContentEnrichmentOptions,
): Promise<unknown> {
  const urlGenerator = options.urlGenerator ?? EntityUrlGenerator.getInstance();

  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return Promise.all(
      data.map((item) => enrichWithUrls(item, { ...options, urlGenerator })),
    );
  }

  if (typeof data !== "object") {
    return data;
  }

  // Recursively enrich all nested objects first (in parallel)
  const enriched: Record<string, unknown> = {};
  const entries = Object.entries(data);
  const enrichedValues = await Promise.all(
    entries.map(([, value]) =>
      enrichWithUrls(value, { ...options, urlGenerator }),
    ),
  );
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry) {
      enriched[entry[0]] = enrichedValues[i];
    }
  }

  // Check if this object is an entity with slug metadata
  const entityCheck = entityWithSlugSchema.safeParse(data);
  if (!entityCheck.success) {
    return enriched;
  }

  const entity = entityCheck.data;
  const entityType = entity.entityType;
  const slug = entity.metadata.slug;

  const config = options.pipelineContext.entityDisplay?.[entityType];

  const typeLabel = config
    ? config.label
    : entityType.charAt(0).toUpperCase() + entityType.slice(1);

  // Compute listUrl and listLabel (plural) for breadcrumbs
  const pluralName = config
    ? (config.pluralName ?? config.label.toLowerCase() + "s")
    : pluralize(entityType);
  const listUrl = `/${pluralName}`;
  const listLabel = pluralName.charAt(0).toUpperCase() + pluralName.slice(1);

  // Resolve only the file-backed build map. Missing entries never materialize
  // entity bytes or inline URLs in the controller during enrichment.
  const coverImageId = extractCoverImageId(entity);
  const coverImageFields = resolveImageFields(coverImageId, options);

  const explicitOgImageId = extractOgImageId(entity);
  const coverImageUrl = coverImageFields.coverImageUrl;
  const ogImage = explicitOgImageId
    ? resolveImageForHead(explicitOgImageId, options)
    : coverImageUrl && !coverImageUrl.startsWith("data:")
      ? toAbsoluteUrl(coverImageUrl, options.siteUrl)
      : undefined;

  const enrichedEntity: EnrichedEntity = {
    ...enriched,
    ...entity,
    url: urlGenerator.generateUrl(entityType, slug),
    typeLabel,
    listUrl,
    listLabel,
    ...coverImageFields,
    ...(ogImage && { ogImageUrl: ogImage }),
  };

  return enrichedEntity;
}

function resolveImageFields(
  imageId: string | undefined,
  options: ContentEnrichmentOptions,
): Partial<EnrichedEntity> {
  const preResolved = imageId
    ? options.imageBuildService?.get(imageId)
    : undefined;
  if (preResolved) {
    return {
      coverImageUrl: preResolved.src,
      coverImageWidth: preResolved.width,
      coverImageHeight: preResolved.height,
      ...(preResolved.srcset && {
        coverImageSrcset: preResolved.srcset,
        coverImageSizes: preResolved.sizes,
      }),
    };
  }

  return {};
}

function resolveImageForHead(
  imageId: string | undefined,
  options: ContentEnrichmentOptions,
): string | undefined {
  if (!imageId) return undefined;
  const preResolved = options.imageBuildService?.get(imageId);
  return preResolved
    ? toAbsoluteUrl(preResolved.src, options.siteUrl)
    : undefined;
}

function toAbsoluteUrl(url: string, siteUrl: string | undefined): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  if (!siteUrl) return url;
  return `${siteUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

/**
 * Scan all entities for coverImageId references to pre-resolve before rendering.
 */
export async function collectAllImageIds(
  entityService: ServiceEntityService,
  logger: Logger,
): Promise<string[]> {
  const imageIds = new Set<string>();

  try {
    // Get all entity types that have been registered
    const entityTypes = entityService.getEntityTypes();

    for (const entityType of entityTypes) {
      if (entityType === "image") continue; // Skip image entities themselves

      const entities = await entityService.listEntities({ entityType });

      for (const entity of entities) {
        if (entity.content.includes("entity://image/")) {
          for (const image of extractMarkdownImages(entity.content)) {
            const match = /^entity:\/\/image\/(.+)$/.exec(image.url);
            if (match?.[1]) imageIds.add(match[1]);
          }
        }
        const coverImageId = extractCoverImageId(entity);
        if (coverImageId) {
          imageIds.add(coverImageId);
        }
        const ogImageId = extractOgImageId(entity);
        if (ogImageId) {
          imageIds.add(ogImageId);
        }
      }
    }
  } catch (error) {
    logger.warn("Failed to collect image IDs for pre-resolution", {
      error: getErrorMessage(error),
    });
  }

  return [...imageIds];
}
