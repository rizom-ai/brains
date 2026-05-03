import { generateImage } from "ai";
import type { Logger } from "@brains/utils";
import type {
  AspectRatio,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";
import type { ProviderClients } from "./provider-clients";
import { selectImageProvider } from "./provider-selection";

/**
 * Generate an image from a text prompt using the configured image provider.
 */
export async function generateImageResult(
  prompt: string,
  imageModel: string | undefined,
  options: ImageGenerationOptions | undefined,
  providers: ProviderClients,
  logger: Logger,
): Promise<ImageGenerationResult> {
  const { provider, modelId } = selectImageProvider(imageModel);

  if (provider === "openai" && !providers.openaiProvider) {
    throw new Error(
      "Image generation not available: no OpenAI API key configured",
    );
  }
  if (provider === "google" && !providers.googleProvider) {
    throw new Error(
      "Image generation not available: no Google API key configured",
    );
  }

  logger.debug("Generating image", {
    prompt: prompt.slice(0, 100),
    provider,
    model: modelId,
  });

  try {
    const aspectRatio: AspectRatio = options?.aspectRatio ?? "16:9";
    const result =
      provider === "google"
        ? await generateImageWithGoogle(prompt, aspectRatio, modelId, providers)
        : await generateImageWithOpenAI(
            prompt,
            aspectRatio,
            modelId,
            providers,
          );

    const base64 = result.image.base64;
    const dataUrl = `data:image/png;base64,${base64}`;

    logger.debug("Image generated successfully", {
      provider,
      model: modelId,
    });

    return { base64, dataUrl };
  } catch (error) {
    logger.error("Failed to generate image", error);
    throw new Error("Image generation failed");
  }
}

async function generateImageWithOpenAI(
  prompt: string,
  aspectRatio: AspectRatio,
  modelId: string,
  providers: ProviderClients,
): Promise<{ image: { base64: string } }> {
  if (!providers.openaiProvider) {
    throw new Error("OpenAI provider not configured");
  }
  return generateImage({
    model: providers.openaiProvider.image(modelId),
    prompt,
    size: ASPECT_RATIO_TO_OPENAI_SIZE[aspectRatio],
    providerOptions: {
      openai: { quality: "medium" },
    },
  });
}

async function generateImageWithGoogle(
  prompt: string,
  aspectRatio: AspectRatio,
  modelId: string,
  providers: ProviderClients,
): Promise<{ image: { base64: string } }> {
  if (!providers.googleProvider) {
    throw new Error("Google provider not configured");
  }
  return generateImage({
    model: providers.googleProvider.image(modelId),
    prompt,
    aspectRatio,
  });
}

/**
 * Mapping from aspect ratio to OpenAI GPT Image pixel sizes.
 */
const ASPECT_RATIO_TO_OPENAI_SIZE: Record<
  AspectRatio,
  "1024x1024" | "1536x1024" | "1024x1536"
> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
};
