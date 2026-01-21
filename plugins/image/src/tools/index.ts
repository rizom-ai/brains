import type {
  PluginTool,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z, slugify, setCoverImageId } from "@brains/utils";
import {
  imageAdapter,
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "@brains/image";
import type { IImagePlugin, EntityWithCoverImage } from "../types";

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
  plugin: IImagePlugin,
  pluginId: string,
): PluginTool {
  return createTool(
    pluginId,
    "upload",
    "Upload an image from a base64 data URL or fetch from HTTP URL",
    uploadInputSchema.shape,
    async (input: unknown, _toolContext: ToolContext) => {
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
        const result = await plugin.createEntity({
          ...entityData,
          id: slug,
        });

        return {
          success: true,
          data: { imageId: slug, jobId: result.jobId },
          message: `Image uploaded: ${title} (${entityData.metadata.width}x${entityData.metadata.height})`,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
        };
      }
    },
  );
}

/**
 * Build a contextual base prompt for image generation
 * Incorporates identity and profile for brand consistency
 */
function buildImageBasePrompt(plugin: IImagePlugin): string {
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
  if (identity.values.length > 0) {
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
  context: ServicePluginContext,
  plugin: IImagePlugin,
  pluginId: string,
): PluginTool {
  return createTool(
    pluginId,
    "generate",
    "Queue a job to generate an image from a text prompt using DALL-E 3. Requires OPENAI_API_KEY to be configured.",
    generateInputSchema.shape,
    async (input: unknown, toolContext: ToolContext) => {
      try {
        // Check if image generation is available
        if (!plugin.canGenerateImages()) {
          return {
            success: false,
            error:
              "Image generation not available: OPENAI_API_KEY not configured",
          };
        }

        const { prompt, title, size, style } = generateInputSchema.parse(input);

        // Build full prompt with base context
        const basePrompt = buildImageBasePrompt(plugin);
        const fullPrompt = basePrompt + prompt;

        // Queue the image generation job
        const jobId = await context.jobs.enqueue(
          "image-generate",
          {
            prompt: fullPrompt,
            title,
            ...(size && { size }),
            ...(style && { style }),
          },
          toolContext,
          {
            source: `${pluginId}_generate`,
            metadata: {
              operationType: "content_operations",
              operationTarget: "image",
            },
          },
        );

        return {
          success: true,
          data: { jobId },
          message: `Image generation job queued (jobId: ${jobId})`,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
        };
      }
    },
  );
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
    .optional()
    .describe("Image ID to set as cover, or null to remove"),
  generate: z
    .boolean()
    .optional()
    .describe("Generate a new cover image based on entity title"),
  prompt: z
    .string()
    .optional()
    .describe("Custom prompt for image generation (used with generate: true)"),
  size: z
    .enum(["1024x1024", "1792x1024", "1024x1792"])
    .optional()
    .describe(
      "Image size when generating: square, landscape (default), or portrait",
    ),
  style: z
    .enum(["vivid", "natural"])
    .optional()
    .describe("Style when generating: vivid (dramatic, default) or natural"),
});

/**
 * Create the set-cover tool
 */
function createSetCoverTool(
  context: ServicePluginContext,
  plugin: IImagePlugin,
  pluginId: string,
): PluginTool {
  return createTool(
    pluginId,
    "set-cover",
    "Set or remove cover image on an entity. Use imageId to set existing image, generate:true to queue image generation job, or imageId:null to remove.",
    setCoverInputSchema.shape,
    async (input: unknown, toolContext: ToolContext) => {
      try {
        const { entityType, entityId, imageId, generate, prompt, size, style } =
          setCoverInputSchema.parse(input);

        // Get adapter and check capability
        const adapter = plugin.getAdapter(entityType);
        if (!adapter?.supportsCoverImage) {
          return {
            success: false,
            error: `Entity type '${entityType}' doesn't support cover images`,
          };
        }

        // Get entity - cast to EntityWithCoverImage since adapter.supportsCoverImage is true
        const baseEntity = await plugin.findEntity(entityType, entityId);
        if (!baseEntity) {
          return {
            success: false,
            error: `Entity not found: ${entityId}`,
          };
        }
        const entity = baseEntity as EntityWithCoverImage;

        // Generate new image if requested (async via job queue)
        if (generate) {
          if (!plugin.canGenerateImages()) {
            return {
              success: false,
              error:
                "Image generation not available: OPENAI_API_KEY not configured",
            };
          }

          // Extract title from entity metadata (properly typed via EntityWithCoverImage)
          const entityTitle = entity.metadata.title;
          const imageTitle = `${entityTitle} Cover`;

          // Build generation prompt
          const basePrompt = buildImageBasePrompt(plugin);
          const subjectPrompt = prompt ?? `Cover image for: ${entityTitle}`;
          const fullPrompt = basePrompt + subjectPrompt;

          // Queue the image generation job with target entity info
          const jobId = await context.jobs.enqueue(
            "image-generate",
            {
              prompt: fullPrompt,
              title: imageTitle,
              ...(size && { size }),
              ...(style && { style }),
              targetEntityType: entityType,
              targetEntityId: entity.id,
            },
            toolContext,
            {
              source: `${pluginId}_set-cover`,
              metadata: {
                operationType: "content_operations",
                operationTarget: "image",
              },
            },
          );

          return {
            success: true,
            data: {
              jobId,
              entityType,
              entityId,
            },
            message: `Cover image generation job queued for ${entityType}/${entityId} (jobId: ${jobId})`,
          };
        }

        // Set existing image or remove
        const finalImageId: string | null = imageId ?? null;

        if (finalImageId) {
          // Validate existing image exists
          const image = await plugin.getEntity("image", finalImageId);
          if (!image) {
            return {
              success: false,
              error: `Image not found: ${finalImageId}`,
            };
          }
        }

        // Update entity using shared utility
        const updated = setCoverImageId(entity, finalImageId);
        await plugin.updateEntity(updated);

        const message = finalImageId
          ? `Cover image set to '${finalImageId}' on ${entityType}/${entityId}`
          : `Cover image removed from ${entityType}/${entityId}`;

        return {
          success: true,
          data: {
            entityType,
            entityId,
            imageId: finalImageId,
            generated: false,
          },
          message,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
        };
      }
    },
  );
}

/**
 * Create all image tools
 */
export function createImageTools(
  context: ServicePluginContext,
  plugin: IImagePlugin,
  pluginId: string,
): PluginTool[] {
  return [
    createImageUploadTool(plugin, pluginId),
    createImageGenerateTool(context, plugin, pluginId),
    createSetCoverTool(context, plugin, pluginId),
  ];
}
