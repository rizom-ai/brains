import type {
  EntityFileAssets,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import type { AIModelConfig, ImageGenerationOptions } from "./types";
import { createImageGenerationRequest } from "./image-generation-request";

export interface ImageFileDependencies {
  getFiles(): Pick<EntityFileAssets, "withProducedFile"> | undefined;
}
export type GeneratedImageConsumer<T> = (
  file: EntityVerifiedFileSource,
  signal: AbortSignal,
) => Promise<T>;

/** Controller metadata only. The named SDK actor and its consumer share the
 * existing file runtime; no buffered fallback or independent producer pool.
 */
export async function withGeneratedImageFile<T>(
  prompt: string,
  config: AIModelConfig,
  files: ImageFileDependencies | undefined,
  use: GeneratedImageConsumer<T>,
  options?: ImageGenerationOptions,
): Promise<T> {
  options?.signal?.throwIfAborted();
  const request = createImageGenerationRequest(prompt, config, options);
  const producer = files?.getFiles();
  if (!producer?.withProducedFile)
    throw new Error("AI image file production is not provisioned");
  return producer.withProducedFile(undefined, use, {
    producer: "ai-image",
    metadata: { ...request },
    ...(options?.signal && { signal: options.signal }),
  });
}
