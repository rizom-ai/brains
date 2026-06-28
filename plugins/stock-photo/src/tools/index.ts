import { z } from "@brains/utils";
import type {
  Tool,
  ToolResponse,
  IEntityService,
  ServicePluginContext,
} from "@brains/plugins";
import type {
  StockPhotoProvider,
  FetchImageFn,
  SelectResult,
} from "../lib/types";

export interface StockPhotoToolsDeps {
  provider: StockPhotoProvider;
  entityService: IEntityService;
  fetchImage: FetchImageFn;
  jobs: ServicePluginContext["jobs"];
}

const searchInputSchema = {
  query: z.string().describe("Search terms for stock photos"),
  perPage: z
    .number()
    .min(1)
    .max(30)
    .default(10)
    .describe("Results per page (1-30)"),
  page: z.number().min(1).default(1).describe("Page number"),
};

const selectInputSchema = {
  photoId: z.string().describe("Photo ID from search results"),
  downloadLocation: z
    .string()
    .url()
    .describe("Download tracking URL (required by provider ToS)"),
  photographerName: z.string().describe("Photographer name for attribution"),
  photographerUrl: z
    .string()
    .url()
    .describe("Photographer profile URL for attribution"),
  sourceUrl: z.string().url().describe("Photo page URL on provider"),
  imageUrl: z.string().url().describe("Image URL to download"),
  title: z.string().optional().describe("Image entity title"),
  alt: z.string().optional().describe("Alt text for the image"),
  targetEntityType: z
    .string()
    .optional()
    .describe("Entity type to set cover image on"),
  targetEntityId: z
    .string()
    .optional()
    .describe("Entity ID to set cover image on"),
};

export function createStockPhotoTools(
  pluginId: string,
  deps: StockPhotoToolsDeps,
): Tool[] {
  return [createSearchTool(pluginId, deps), createSelectTool(pluginId, deps)];
}

function createSearchTool(pluginId: string, deps: StockPhotoToolsDeps): Tool {
  return {
    name: `${pluginId}_search`,
    description:
      "Search for stock photos. Returns photo candidates with preview URLs and metadata. Use stock-photo_select to materialize a chosen photo into an image entity.",
    inputSchema: searchInputSchema,
    visibility: "anchor",
    sideEffects: "none",
    handler: async (input): Promise<ToolResponse> => {
      const parsed = z.object(searchInputSchema).safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      try {
        const result = await deps.provider.searchPhotos(parsed.data.query, {
          page: parsed.data.page,
          perPage: parsed.data.perPage,
        });
        return { success: true, data: result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Search failed";
        return { success: false, error: msg };
      }
    },
  };
}

function createSelectTool(pluginId: string, deps: StockPhotoToolsDeps): Tool {
  return {
    name: `${pluginId}_select`,
    description:
      "Select a stock photo from search results and materialize it as an image entity. Triggers provider download tracking per ToS. Optionally sets as cover image on a target entity.",
    inputSchema: selectInputSchema,
    visibility: "anchor",
    sideEffects: "external",
    handler: async (input): Promise<ToolResponse> => {
      const parsed = z.object(selectInputSchema).safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      const {
        photoId,
        downloadLocation,
        photographerName,
        photographerUrl,
        sourceUrl,
        imageUrl,
        title,
        alt,
        targetEntityType,
        targetEntityId,
      } = parsed.data;

      const attribution = { photographerName, photographerUrl, sourceUrl };

      // Deduplicate by image URL stored as sourceUrl on the entity
      const existing = await deps.entityService.listEntities({
        entityType: "image",
        options: {
          limit: 1,
          filter: { metadata: { sourceUrl: imageUrl } },
        },
      });

      if (existing[0]) {
        const result: SelectResult = {
          imageEntityId: existing[0].id,
          alreadyExisted: true,
          attribution,
        };

        if (targetEntityType && targetEntityId) {
          await setCoverImage(
            deps.entityService,
            targetEntityType,
            targetEntityId,
            existing[0].id,
          );
          result.coverSet = true;
        }

        return { success: true, data: result };
      }

      const jobId = await deps.jobs.enqueue({
        type: "select-photo",
        data: {
          photoId,
          downloadLocation,
          photographerName,
          photographerUrl,
          sourceUrl,
          imageUrl,
          ...(title !== undefined ? { title } : {}),
          ...(alt !== undefined ? { alt } : {}),
          ...(targetEntityType !== undefined ? { targetEntityType } : {}),
          ...(targetEntityId !== undefined ? { targetEntityId } : {}),
        },
      });

      const result: SelectResult = {
        imageEntityId: photoId,
        alreadyExisted: false,
        attribution,
        jobId,
        status: "generating",
      };
      if (targetEntityType && targetEntityId) {
        result.coverSet = true;
      }

      return { success: true, data: result };
    },
  };
}

async function setCoverImage(
  entityService: IEntityService,
  entityType: string,
  entityId: string,
  imageEntityId: string,
): Promise<void> {
  const target = await entityService.getEntity({
    entityType: entityType,
    id: entityId,
  });
  if (!target) return;

  await entityService.updateEntity({
    entity: {
      ...target,
      metadata: {
        ...target.metadata,
        coverImageId: imageEntityId,
      },
    },
  });
}
