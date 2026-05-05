import type { Logger } from "@brains/utils";
import {
  EntityUrlGenerator,
  getCoverImageId,
  getErrorMessage,
  pluralize,
  z,
} from "@brains/utils";
import type { SiteImageLookup } from "@brains/site-engine";
import type { IEntityService } from "@brains/plugins";
import type { BuildPipelineContext } from "./build-pipeline-context";

const entityWithSlugSchema = z
  .object({
    id: z.string(),
    entityType: z.string(),
    content: z.string(),
    metadata: z
      .object({
        slug: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const imageEntitySchema = z.object({
  content: z.string(),
  metadata: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .passthrough(),
});

// Type for enriched entity with url, typeLabel, listUrl, and listLabel
export type EnrichedEntity = z.infer<typeof entityWithSlugSchema> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
  coverImageUrl?: string;
  coverImageWidth?: number;
  coverImageHeight?: number;
  coverImageSrcset?: string;
  coverImageSizes?: string;
};

export interface ContentEnrichmentOptions {
  pipelineContext: Pick<BuildPipelineContext, "services" | "entityDisplay">;
  imageBuildService?: SiteImageLookup | null | undefined;
  urlGenerator?: EntityUrlGenerator | undefined;
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

  // Resolve cover image: prefer pre-optimized build image, fall back to data URL
  const coverImageId = getCoverImageId(entity) ?? undefined;
  const preResolved = coverImageId
    ? options.imageBuildService?.get(coverImageId)
    : undefined;

  let coverImageFields: Partial<EnrichedEntity> = {};
  if (preResolved) {
    coverImageFields = {
      coverImageUrl: preResolved.src,
      coverImageWidth: preResolved.width,
      coverImageHeight: preResolved.height,
      ...(preResolved.srcset && {
        coverImageSrcset: preResolved.srcset,
        coverImageSizes: preResolved.sizes,
      }),
    };
  } else {
    // Fallback: resolve directly (returns data URL — post-processing will extract)
    const coverImage = await resolveCoverImage(
      coverImageId,
      options.pipelineContext.services.entityService,
    );
    if (coverImage) {
      coverImageFields = {
        coverImageUrl: coverImage.url,
        ...(coverImage.width && { coverImageWidth: coverImage.width }),
        ...(coverImage.height && { coverImageHeight: coverImage.height }),
      };
    }
  }

  const enrichedEntity: EnrichedEntity = {
    ...enriched,
    ...entity,
    url: urlGenerator.generateUrl(entityType, slug),
    typeLabel,
    listUrl,
    listLabel,
    ...coverImageFields,
  };

  return enrichedEntity;
}

async function resolveCoverImage(
  imageId: string | undefined,
  entityService: IEntityService,
): Promise<
  | {
      url: string;
      width?: number;
      height?: number;
    }
  | undefined
> {
  if (!imageId) return undefined;

  const image = await entityService.getEntity({
    entityType: "image",
    id: imageId,
  });
  const imageCheck = imageEntitySchema.safeParse(image);
  if (!imageCheck.success) return undefined;

  return {
    url: imageCheck.data.content,
    ...(imageCheck.data.metadata.width && {
      width: imageCheck.data.metadata.width,
    }),
    ...(imageCheck.data.metadata.height && {
      height: imageCheck.data.metadata.height,
    }),
  };
}

/**
 * Scan all entities for coverImageId references to pre-resolve before rendering.
 */
export async function collectAllImageIds(
  entityService: IEntityService,
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
        const coverImageId = getCoverImageId(entity);
        if (coverImageId) {
          imageIds.add(coverImageId);
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
