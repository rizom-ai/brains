import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import type { Logger } from "@brains/utils/logger";
import { AIService } from "../../src/aiService";
import type { AIModelConfig, ImageGenerationOptions } from "../../src/types";
import { generateImageFile } from "../../src/image-generation-file";

/** Unit-test producer runs the actor-local function with the suite's SDK stubs.
 * Real process ownership is covered separately; this is not a runtime fallback.
 */
export function createImageService(
  config: AIModelConfig,
  logger: Logger,
): AIService {
  return AIService.createFresh(config, logger, {
    getFiles: () => ({
      withProducedFile: async (
        _source,
        use,
        options,
      ): ReturnType<typeof use> => {
        assert.equal(options?.producer, "ai-image");
        const directory = await mkdtemp(
          join(tmpdir(), "ai-image-service-test-"),
        );
        const sourceFile = join(directory, "image");
        const facts = await generateImageFile(
          {
            sourceDirectory: directory,
            outputFile: sourceFile,
            ...(options.metadata && { metadata: options.metadata }),
          },
          {},
          options.signal,
        );
        const result = await use(
          { sourceFile, ...facts },
          options.signal ?? new AbortController().signal,
        );
        await rm(directory, { recursive: true });
        return result;
      },
    }),
  });
}
/** Independent fixture verification; production consumers never materialize these bytes. */
export async function readGeneratedImage(
  service: AIService,
  prompt: string,
  options?: ImageGenerationOptions,
): Promise<{ base64: string; dataUrl: string }> {
  return service.withGeneratedImageFile(
    prompt,
    async (source) => {
      const bytes = await readFile(source.sourceFile);
      const base64 = bytes.toString("base64");
      return { base64, dataUrl: `data:image/png;base64,${base64}` };
    },
    options,
  );
}
