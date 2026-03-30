import { z } from "@brains/utils";
import { imageAdapter } from "@brains/image";
import type { Tool, ToolResponse, IEntityService } from "@brains/plugins";
import type { StockPhotoProvider } from "../lib/types";

type FetchImageFn = (url: string) => Promise<string>;

export interface StockPhotoToolsDeps {
  provider: StockPhotoProvider;
  entityService: IEntityService;
  fetchImage: FetchImageFn;
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

function createSearchTool(_pluginId: string, deps: StockPhotoToolsDeps): Tool {
  return {
    name: "stock-photo_search",
    description:
      "Search for stock photos. Returns photo candidates with preview URLs and metadata. Use stock-photo_select to materialize a chosen photo into an image entity.",
    inputSchema: searchInputSchema,
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

function createSelectTool(_pluginId: string, deps: StockPhotoToolsDeps): Tool {
  return {
    name: "stock-photo_select",
    description:
      "Select a stock photo from search results and materialize it as an image entity. Triggers provider download tracking per ToS. Optionally sets as cover image on a target entity.",
    inputSchema: selectInputSchema,
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

      // Check deduplication by sourceUrl
      const existing = await deps.entityService.listEntities("image", {
        limit: 1,
        filter: { metadata: { sourceUrl: imageUrl } },
      });

      if (existing[0]) {
        const result: Record<string, unknown> = {
          imageEntityId: existing[0].id,
          alreadyExisted: true,
          attribution: { photographerName, photographerUrl, sourceUrl },
        };

        if (targetEntityType && targetEntityId) {
          await setCoverImage(
            deps.entityService,
            targetEntityType,
            targetEntityId,
            existing[0].id,
          );
          result["coverSet"] = true;
        }

        return { success: true, data: result };
      }

      // Trigger download tracking (fire-and-forget per ToS)
      deps.provider.triggerDownload(downloadLocation).catch(() => {});

      // Download image
      let dataUrl: string;
      try {
        dataUrl = await deps.fetchImage(imageUrl);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Image download failed";
        return { success: false, error: msg };
      }

      // Create image entity
      const imageTitle = title ?? `Stock photo ${photoId}`;
      const imageData = imageAdapter.createImageEntity({
        dataUrl,
        title: imageTitle,
        alt: alt ?? imageTitle,
      });

      const { entityId } = await deps.entityService.createEntity({
        id: photoId,
        ...imageData,
        metadata: {
          ...imageData.metadata,
          sourceUrl: imageUrl,
        },
      } as Parameters<typeof deps.entityService.createEntity>[0]);

      const result: Record<string, unknown> = {
        imageEntityId: entityId,
        alreadyExisted: false,
        attribution: { photographerName, photographerUrl, sourceUrl },
      };

      if (targetEntityType && targetEntityId) {
        await setCoverImage(
          deps.entityService,
          targetEntityType,
          targetEntityId,
          entityId,
        );
        result["coverSet"] = true;
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
  const target = await entityService.getEntity(entityType, entityId);
  if (!target) return;

  await entityService.updateEntity({
    ...target,
    metadata: {
      ...target.metadata,
      coverImageId: imageEntityId,
    },
  });
}
