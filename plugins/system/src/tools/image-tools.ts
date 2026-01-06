import type { PluginTool, ToolContext, ToolResponse } from "@brains/plugins";
import { z, slugify, formatAsEntity } from "@brains/utils";
import type { Image } from "@brains/image";
import { imageAdapter } from "@brains/image";
import { isValidDataUrl, isHttpUrl, fetchImageAsBase64 } from "@brains/image";
import type { ISystemPlugin } from "../types";

/**
 * Input schema for image_upload tool
 */
const uploadInputSchema = z.object({
  title: z.string().describe("Title for the image (used to generate ID)"),
  source: z
    .string()
    .describe(
      "Image source: base64 data URL (data:image/...) or HTTP URL to fetch",
    ),
});

/**
 * Create the image_upload tool
 */
function createImageUploadTool(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_image-upload`,
    description:
      "Upload an image from a base64 data URL or fetch from HTTP URL",
    inputSchema: uploadInputSchema.shape,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      try {
        const { title, source } = uploadInputSchema.parse(input);

        // Determine source type and get data URL
        let dataUrl: string;
        if (isValidDataUrl(source)) {
          dataUrl = source;
        } else if (isHttpUrl(source)) {
          dataUrl = await fetchImageAsBase64(source);
        } else {
          return {
            status: "error",
            message: "Invalid source: must be a base64 data URL or HTTP URL",
            formatted:
              "_Invalid source: must be a base64 data URL or HTTP URL_",
          };
        }

        // Create image entity data (alt defaults to title)
        const entityData = imageAdapter.createImageEntity({
          dataUrl,
          title,
        });

        // Generate slug from title
        const slug = slugify(title);

        // Create entity in database
        const result = await plugin.createEntity({
          ...entityData,
          id: slug,
        });

        const formatted = formatAsEntity(
          {
            id: slug,
            title,
            format: entityData.metadata.format,
            width: entityData.metadata.width,
            height: entityData.metadata.height,
          },
          { title: "Image Uploaded" },
        );

        return {
          status: "success",
          data: { imageId: slug, jobId: result.jobId },
          message: `Image uploaded: ${title} (${entityData.metadata.width}x${entityData.metadata.height})`,
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          status: "error",
          message: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}

/**
 * Input schema for image_get tool
 */
const getInputSchema = z.object({
  id: z.string().describe("Image ID to retrieve"),
});

/**
 * Create the image_get tool
 */
function createImageGetTool(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_image-get`,
    description: "Retrieve an image entity by ID",
    inputSchema: getInputSchema.shape,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      try {
        const { id } = getInputSchema.parse(input);

        const image = (await plugin.getEntity("image", id)) as Image | null;

        if (!image) {
          return {
            status: "error",
            message: `Image not found: ${id}`,
            formatted: `_Image not found: ${id}_`,
          };
        }

        const formatted = formatAsEntity(
          {
            id: image.id,
            title: image.metadata.title,
            alt: image.metadata.alt,
            format: image.metadata.format,
            width: image.metadata.width,
            height: image.metadata.height,
          },
          { title: image.metadata.title },
        );

        return {
          status: "success",
          data: {
            id: image.id,
            title: image.metadata.title,
            alt: image.metadata.alt,
            format: image.metadata.format,
            width: image.metadata.width,
            height: image.metadata.height,
            // Omit content (base64) from response - too large
          },
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          status: "error",
          message: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}

/**
 * Input schema for image_list tool
 */
const listInputSchema = z.object({
  limit: z.number().optional().describe("Maximum number of images to return"),
});

/**
 * Create the image_list tool
 */
function createImageListTool(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_image-list`,
    description: "List all images",
    inputSchema: listInputSchema.shape,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      try {
        const { limit } = listInputSchema.parse(input);

        const images = (await plugin.listEntities("image", {
          limit: limit ?? 50,
        })) as Image[];

        const imageList = images.map((img) => ({
          id: img.id,
          title: img.metadata.title,
          format: img.metadata.format,
          width: img.metadata.width,
          height: img.metadata.height,
        }));

        const formatted =
          imageList.length > 0
            ? imageList
                .map(
                  (img) =>
                    `- **${img.title}** (${img.id}) - ${img.width}x${img.height}`,
                )
                .join("\n")
            : "_No images found_";

        return {
          status: "success",
          data: { images: imageList, count: imageList.length },
          message: `Found ${imageList.length} images`,
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          status: "error",
          message: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}

/**
 * Create all image tools
 */
export function createImageTools(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool[] {
  return [
    createImageUploadTool(plugin, pluginId),
    createImageGetTool(plugin, pluginId),
    createImageListTool(plugin, pluginId),
  ];
}
