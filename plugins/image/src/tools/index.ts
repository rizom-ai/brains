import type {
  PluginTool,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { z, slugify, formatAsEntity } from "@brains/utils";
import type { Image } from "../schemas/image";
import { imageAdapter } from "../adapters/image-adapter";
import {
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "../lib/image-utils";

/**
 * Output schema for image_upload tool
 */
const uploadOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      imageId: z.string(),
      jobId: z.string(),
    })
    .optional(),
  message: z.string().optional(),
  formatted: z.string().optional(),
  error: z.string().optional(),
});

type UploadOutput = z.infer<typeof uploadOutputSchema>;

/**
 * Output schema for image_get tool
 */
const getOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      id: z.string(),
      title: z.string(),
      alt: z.string(),
      format: z.string(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  formatted: z.string().optional(),
  error: z.string().optional(),
});

type GetOutput = z.infer<typeof getOutputSchema>;

/**
 * Output schema for image_list tool
 */
const listOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      images: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          format: z.string(),
          width: z.number(),
          height: z.number(),
        }),
      ),
      count: z.number(),
    })
    .optional(),
  message: z.string().optional(),
  formatted: z.string().optional(),
  error: z.string().optional(),
});

type ListOutput = z.infer<typeof listOutputSchema>;

// Export types for tests
export type { UploadOutput, GetOutput, ListOutput };

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
export function createUploadTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool<UploadOutput> {
  return {
    name: `${pluginId}_upload`,
    description:
      "Upload an image from a base64 data URL or fetch from HTTP URL",
    inputSchema: uploadInputSchema.shape,
    outputSchema: uploadOutputSchema,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<UploadOutput> => {
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
            success: false,
            error: "Invalid source: must be a base64 data URL or HTTP URL",
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
        const result = await context.entityService.createEntity({
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
          success: true,
          data: { imageId: slug, jobId: result.jobId },
          message: `Image uploaded: ${title} (${entityData.metadata.width}x${entityData.metadata.height})`,
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
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
export function createGetTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool<GetOutput> {
  return {
    name: `${pluginId}_get`,
    description: "Retrieve an image entity by ID",
    inputSchema: getInputSchema.shape,
    outputSchema: getOutputSchema,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<GetOutput> => {
      try {
        const { id } = getInputSchema.parse(input);

        const image = await context.entityService.getEntity<Image>("image", id);

        if (!image) {
          return {
            success: false,
            error: `Image not found: ${id}`,
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
          success: true,
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
          success: false,
          error: msg,
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
export function createListTool(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool<ListOutput> {
  return {
    name: `${pluginId}_list`,
    description: "List all images",
    inputSchema: listInputSchema.shape,
    outputSchema: listOutputSchema,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ListOutput> => {
      try {
        const { limit } = listInputSchema.parse(input);

        const images = await context.entityService.listEntities<Image>(
          "image",
          {
            limit: limit ?? 50,
          },
        );

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
          success: true,
          data: { images: imageList, count: imageList.length },
          message: `Found ${imageList.length} images`,
          formatted,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
          formatted: `_Error: ${msg}_`,
        };
      }
    },
  };
}
