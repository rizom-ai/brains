import { withFileSource } from "@brains/db/file-source";
import {
  produceFile,
  fileProduceSchema,
  type FileProduceInput,
} from "@brains/db/file-produce";
import {
  extractPdfMarkdown,
  defaultPdfMarkdownMaxBytes,
} from "./lib/pdf-markdown";
import {
  uploadMarkdownRequestSchema,
  UPLOAD_MARKDOWN_RESULT_BYTES,
} from "./upload-markdown";

/** Actor-only source reads and PDF parsing. No source payload crosses IPC. */
export async function produceUploadMarkdown(
  input: FileProduceInput,
  signal?: AbortSignal,
): Promise<{ sizeBytes: number; sha256: string }> {
  const plan = fileProduceSchema.parse(input);
  const request = uploadMarkdownRequestSchema.parse(plan.metadata);
  signal?.throwIfAborted();
  if (
    request.mediaType === "application/pdf" &&
    request.sizeBytes > defaultPdfMarkdownMaxBytes
  )
    throw new Error(
      `Uploaded PDF is too large for synchronous markdown extraction (${request.sizeBytes} bytes; max ${defaultPdfMarkdownMaxBytes} bytes)`,
    );
  return produceFile(
    plan,
    async (): Promise<Uint8Array> => {
      const content = await withFileSource(
        { path: request.sourceFile, sizeBytes: request.sizeBytes },
        async (source): Promise<Buffer> => {
          const bytes = Buffer.alloc(request.sizeBytes);
          for (let offset = 0; offset < bytes.length; offset += 32768) {
            signal?.throwIfAborted();
            await source.readInto(
              bytes.subarray(offset, Math.min(offset + 32768, bytes.length)),
            );
          }
          await source.complete();
          return bytes;
        },
      );
      signal?.throwIfAborted();
      const markdown =
        request.mediaType === "application/pdf"
          ? await extractPdfMarkdown(content, { signal })
          : content.toString("utf8");
      signal?.throwIfAborted();
      if (
        Buffer.byteLength(JSON.stringify({ markdown }), "utf8") >
        UPLOAD_MARKDOWN_RESULT_BYTES
      )
        throw new Error(
          "Extracted markdown exceeds its control-frame allowance",
        );
      return Buffer.from(markdown, "utf8");
    },
    signal,
  );
}
