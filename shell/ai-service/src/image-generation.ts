import { generateImage } from "ai";
import type { Logger } from "@brains/utils";
import type {
  AspectRatio,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";
import { getImageModel, type ProviderClients } from "./provider-clients";
import { selectImageProvider } from "./provider-selection";

export async function generateImageResult(
  prompt: string,
  imageModel: string | undefined,
  options: ImageGenerationOptions | undefined,
  clients: ProviderClients,
  logger: Logger,
): Promise<ImageGenerationResult> {
  const { provider, modelId } = selectImageProvider(imageModel);
  const model = getImageModel(clients, provider, modelId);

  logger.debug("Generating image", {
    prompt: prompt.slice(0, 100),
    provider,
    model: modelId,
  });

  try {
    const aspectRatio: AspectRatio = options?.aspectRatio ?? "16:9";
    const result =
      provider === "google"
        ? await generateImage({ model, prompt, aspectRatio })
        : await generateImage({
            model,
            prompt,
            size: ASPECT_RATIO_TO_OPENAI_SIZE[aspectRatio],
            providerOptions: {
              openai: { quality: "medium" },
            },
          });

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
