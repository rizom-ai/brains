import type { PluginTool, ToolContext, ToolResponse } from "@brains/plugins";
import { z, slugify, formatAsEntity, setCoverImageId } from "@brains/utils";
import type { Image } from "@brains/image";
import { imageAdapter } from "@brains/image";
import { isValidDataUrl, isHttpUrl, fetchImageAsBase64 } from "@brains/image";
import type { ISystemPlugin } from "../types";
import type { ImageGenerationOptions } from "@brains/ai-service";

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
 * Build a contextual base prompt for image generation
 * Incorporates identity and profile for brand consistency
 */
function buildImageBasePrompt(plugin: ISystemPlugin): string {
  const identity = plugin.getIdentityData();
  const profile = plugin.getProfileData();

  // Build context from available data
  const contextParts: string[] = [];

  if (identity.name) {
    contextParts.push(`Brand/Creator: ${identity.name}`);
  }
  if (identity.role) {
    contextParts.push(`Focus: ${identity.role}`);
  }
  if (identity.values?.length) {
    contextParts.push(`Values: ${identity.values.join(", ")}`);
  }
  if (profile.description) {
    contextParts.push(`Context: ${profile.description}`);
  }

  const brandContext =
    contextParts.length > 0
      ? `\nBrand context:\n${contextParts.map((p) => `- ${p}`).join("\n")}\n`
      : "";

  return `Create an illustrative, artistic image.

Style guidelines:
- Modern, clean aesthetic with bold colors and clear composition
- Illustrative and conceptual, NOT photorealistic
- Visually striking with good contrast (works well with text overlays)
- Abstract or stylized representations of concepts
- Professional and polished look
${brandContext}
Image subject: `;
}

/**
 * Input schema for image_generate tool
 */
const generateInputSchema = z.object({
  prompt: z
    .string()
    .describe("Text description of the image to generate (be specific)"),
  title: z.string().describe("Title for the generated image (used as ID)"),
  size: z
    .enum(["1024x1024", "1792x1024", "1024x1792"])
    .optional()
    .describe("Image size: square, landscape (default), or portrait"),
  style: z
    .enum(["vivid", "natural"])
    .optional()
    .describe("Style: vivid (dramatic, default) or natural (less hyper-real)"),
});

/**
 * Create the image_generate tool
 */
function createImageGenerateTool(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_image-generate`,
    description:
      "Generate an image from a text prompt using DALL-E 3. Requires OPENAI_API_KEY to be configured.",
    inputSchema: generateInputSchema.shape,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      try {
        // Check if image generation is available
        if (!plugin.canGenerateImages()) {
          return {
            status: "error",
            message:
              "Image generation not available: OPENAI_API_KEY not configured",
            formatted:
              "_Image generation not available: OPENAI_API_KEY not configured_",
          };
        }

        const { prompt, title, size, style } = generateInputSchema.parse(input);

        // Build options
        const options: ImageGenerationOptions = {};
        if (size) options.size = size;
        if (style) options.style = style;

        // Build full prompt with base context
        const basePrompt = buildImageBasePrompt(plugin);
        const fullPrompt = basePrompt + prompt;

        // Generate the image
        const result = await plugin.generateImage(fullPrompt, options);

        // Create image entity from the generated data URL
        const entityData = imageAdapter.createImageEntity({
          dataUrl: result.dataUrl,
          title,
        });

        // Generate slug from title
        const slug = slugify(title);

        // Create entity in database
        const createResult = await plugin.createEntity({
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
            prompt: prompt.slice(0, 100) + (prompt.length > 100 ? "..." : ""),
          },
          { title: "Image Generated" },
        );

        return {
          status: "success",
          data: { imageId: slug, jobId: createResult.jobId },
          message: `Image generated: ${title} (${entityData.metadata.width}x${entityData.metadata.height})`,
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
 * Input schema for set-cover tool
 */
const setCoverInputSchema = z.object({
  entityType: z.string().describe("Entity type (e.g., 'post', 'project')"),
  entityId: z.string().describe("Entity ID or slug"),
  imageId: z
    .string()
    .nullable()
    .describe("Image ID to set as cover, or null to remove"),
});

/**
 * Create the set-cover tool
 */
function createSetCoverTool(
  plugin: ISystemPlugin,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_set-cover`,
    description:
      "Set or remove cover image on an entity that supports it (blog posts, projects)",
    inputSchema: setCoverInputSchema.shape,
    visibility: "anchor",
    handler: async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<ToolResponse> => {
      try {
        const { entityType, entityId, imageId } =
          setCoverInputSchema.parse(input);

        // Get adapter and check capability
        const adapter = plugin.getAdapter(entityType);
        if (!adapter?.supportsCoverImage) {
          return {
            status: "error",
            message: `Entity type '${entityType}' doesn't support cover images`,
            formatted: `_Entity type '${entityType}' doesn't support cover images_`,
          };
        }

        // Get entity
        const entity = await plugin.findEntity(entityType, entityId);
        if (!entity) {
          return {
            status: "error",
            message: `Entity not found: ${entityId}`,
            formatted: `_Entity not found: ${entityId}_`,
          };
        }

        // Validate image exists (if setting, not removing)
        if (imageId) {
          const image = await plugin.getEntity("image", imageId);
          if (!image) {
            return {
              status: "error",
              message: `Image not found: ${imageId}`,
              formatted: `_Image not found: ${imageId}_`,
            };
          }
        }

        // Update entity using shared utility
        const updated = setCoverImageId(entity, imageId);
        await plugin.updateEntity(updated);

        const message = imageId
          ? `Cover image set to '${imageId}' on ${entityType}/${entityId}`
          : `Cover image removed from ${entityType}/${entityId}`;

        return {
          status: "success",
          data: { entityType, entityId, imageId },
          message,
          formatted: message,
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
    createImageGenerateTool(plugin, pluginId),
    createSetCoverTool(plugin, pluginId),
  ];
}
