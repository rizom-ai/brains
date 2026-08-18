import { z } from "@brains/utils/zod";
import type {
  Tool,
  ServiceEntityService,
  ServicePluginContext,
} from "@brains/plugins";
import { createTool } from "@brains/plugins";
import type {
  StockPhotoProvider,
  FetchImageFn,
  SelectResult,
} from "../lib/types";
import { setCoverImage } from "../lib/set-cover-image";
import { getErrorMessage } from "@brains/utils/error";

export interface StockPhotoToolsDeps {
  provider: StockPhotoProvider;
  entityService: ServiceEntityService;
  fetchImage: FetchImageFn;
  jobs: ServicePluginContext["jobs"];
}

const searchInputSchema = z.object({
  query: z.string().describe("Search terms for stock photos"),
  perPage: z
    .number()
    .min(1)
    .max(30)
    .default(10)
    .describe("Results per page (1-30)"),
  page: z.number().min(1).default(1).describe("Page number"),
});

const selectInputSchema = z.object({
  photoId: z.string().describe("Photo ID from search results"),
  downloadLocation: z
    .url()
    .describe("Download tracking URL (required by provider ToS)"),
  photographerName: z.string().describe("Photographer name for attribution"),
  photographerUrl: z.url().describe("Photographer profile URL for attribution"),
  sourceUrl: z.url().describe("Photo page URL on provider"),
  imageUrl: z.url().describe("Image URL to download"),
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
});

export function createStockPhotoTools(
  pluginId: string,
  deps: StockPhotoToolsDeps,
): Tool[] {
  return [createSearchTool(pluginId, deps), createSelectTool(pluginId, deps)];
}

function createSearchTool(pluginId: string, deps: StockPhotoToolsDeps): Tool {
  return createTool(
    pluginId,
    "search",
    "Search for stock photos. Returns photo candidates with preview URLs and metadata. Use stock-photo_select to materialize a chosen photo into an image entity.",
    searchInputSchema,
    async (input) => {
      try {
        const result = await deps.provider.searchPhotos(input.query, {
          page: input.page,
          perPage: input.perPage,
        });
        return { success: true, data: result };
      } catch (err) {
        const msg = getErrorMessage(err, "Search failed");
        return { success: false, error: msg };
      }
    },
    { sideEffects: "none" },
  );
}

function createSelectTool(pluginId: string, deps: StockPhotoToolsDeps): Tool {
  return createTool(
    pluginId,
    "select",
    "Select a stock photo from search results and materialize it as an image entity. Triggers provider download tracking per ToS. Optionally sets as cover image on a target entity.",
    selectInputSchema,
    async (input) => {
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
      } = input;

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
          result.coverSet = await setCoverImage(
            deps.entityService,
            targetEntityType,
            targetEntityId,
            existing[0].id,
          );
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
        // The queued job sets the cover once the image is materialized.
        result.coverSet = false;
      }

      return { success: true, data: result };
    },
    { sideEffects: "external" },
  );
}
