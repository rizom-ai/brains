import { isAbsolute } from "node:path";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { z } from "@brains/utils/zod";
import { readExtractedTextFile } from "./extracted-text-file";
import type {
  EntityFileAssets,
  EntityBinaryRequestOptions,
} from "@brains/entity-service";

// Leave control-frame space for the entity/job envelope and title frontmatter.
// This bounds serialized extracted text, not PDF parser/native peak memory.
export const UPLOAD_MARKDOWN_RESULT_BYTES: number =
  16 * 1024 * 1024 - 64 * 1024;
export interface UploadMarkdownRequest {
  sourceFile: string;
  sizeBytes: number;
  mediaType: string;
}
export const uploadMarkdownRequestSchema: z.ZodType<UploadMarkdownRequest> =
  z.strictObject({
    sourceFile: z
      .string()
      .min(1)
      .max(4096)
      .refine(isAbsolute)
      .refine((value) => !value.includes("\0")),
    sizeBytes: z.coerce.number().int().nonnegative().max(MAX_ASSET_BYTES),
    mediaType: z.enum([
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/x-markdown",
      "application/json",
    ]),
  });
/** Read only extracted, bounded UTF-8 text; PDF bytes and parsing stay actor-local.
 * The callback retains the producer loan and its cancellation signal. */
export async function withUploadMarkdown<T>(
  files: Pick<EntityFileAssets, "withProducedFile">,
  input: UploadMarkdownRequest,
  use: (markdown: string, signal: AbortSignal) => Promise<T>,
  options?: EntityBinaryRequestOptions,
): Promise<T> {
  const request = uploadMarkdownRequestSchema.parse(input);
  options?.signal?.throwIfAborted();
  if (!files.withProducedFile)
    throw new Error("Upload markdown extraction is not provisioned");
  return files.withProducedFile(
    undefined,
    async (file, signal): Promise<T> => {
      const markdown = await readExtractedTextFile(file.sourceFile, {
        maxBytes: UPLOAD_MARKDOWN_RESULT_BYTES,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        signal,
      });
      signal.throwIfAborted();
      return use(markdown, signal);
    },
    {
      producer: "upload-markdown",
      metadata: {
        sourceFile: request.sourceFile,
        sizeBytes: String(request.sizeBytes),
        mediaType: request.mediaType,
      },
      ...(options?.signal && { signal: options.signal }),
    },
  );
}
