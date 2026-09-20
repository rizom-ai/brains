import { generateImage } from "ai";
import {
  fileProduceSchema,
  produceFile,
  type FileProduceInput,
} from "@brains/db/file-produce";
import { createProviderClients, getImageModel } from "./provider-clients";
import { imageGenerationRequestSchema } from "./image-generation-request";
import type { AspectRatio } from "./types";

export interface ImageGenerationFileDependencies {
  generate?: typeof generateImage;
  clients?: typeof createProviderClients;
}
const sizes: Record<AspectRatio, "1024x1024" | "1536x1024" | "1024x1536"> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
};
/** Actor-local SDK allocation. Bounded file output is not an SDK/native peak-memory guarantee. */
export async function generateImageFile(
  input: FileProduceInput,
  deps: ImageGenerationFileDependencies = {},
  signal?: AbortSignal,
): Promise<{ sizeBytes: number; sha256: string }> {
  const parsed = fileProduceSchema.parse(input);
  const request = imageGenerationRequestSchema.parse(parsed.metadata);
  signal?.throwIfAborted();
  const clients = (deps.clients ?? createProviderClients)({
    imageApiKey: request.apiKey,
  });
  const model = getImageModel(clients, request.provider, request.model);
  return produceFile(
    parsed,
    async (): Promise<Uint8Array> => {
      const result = await (deps.generate ?? generateImage)({
        model,
        prompt: request.prompt,
        maxRetries: 0,
        ...(signal && { abortSignal: signal }),
        ...(request.provider === "google"
          ? { aspectRatio: request.aspectRatio }
          : {
              size: sizes[request.aspectRatio],
              providerOptions: { openai: { quality: "medium" } },
            }),
      });
      signal?.throwIfAborted();
      return result.image.uint8Array;
    },
    signal,
  );
}
