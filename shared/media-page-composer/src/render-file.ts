import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { produceFile, type FileProduceInput } from "@brains/db/file-produce";
import type { BlobFacts } from "@brains/db/file-process-owner";
import { screenshotPng, renderPdf } from "@brains/media-renderer";
import { readRenderRequest, MAX_PDF_BYTES } from "./render-request";
import { startStaticRenderServer } from "./media-render-page";
import { readPreviewPdfRequest } from "./preview-pdf-request";

function assertPdfOutput(output: Buffer, maxBytes: number): void {
  if (output.length > maxBytes)
    throw new Error("Rendered PDF exceeds its size limit");
  if (!output.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("Rendered output has no PDF signature");
}

/** SDK injection is actor-local, never a controller-side buffer handoff. */
export interface RenderDirectoryDeps {
  screenshotPng?: typeof screenshotPng;
  renderPdf?: typeof renderPdf;
}
/** Render directory content or a metadata-selected preview URL to a no-replace file.
 * Called only in a payload actor; serving, WebView buffers and hashing stay here.
 */
export async function renderDirectoryFile(
  input: FileProduceInput,
  deps: RenderDirectoryDeps = {},
  signal?: AbortSignal,
): Promise<BlobFacts> {
  return produceFile(
    input,
    async (directory, cancellation): Promise<Buffer> => {
      cancellation?.throwIfAborted();
      const root = await lstat(directory);
      if (!root.isDirectory() || root.isSymbolicLink())
        throw new Error(
          "Render source requires a regular index.html directory",
        );
      const request = await readRenderRequest(directory);
      cancellation?.throwIfAborted();
      if (request.format === "preview-pdf") {
        const { url, ...options } = await readPreviewPdfRequest(directory);
        cancellation?.throwIfAborted();
        const output = await (deps.renderPdf ?? renderPdf)(url, {
          maxBytes: options.maxBytes,
          timeoutMs: options.timeoutMs,
          ...(options.width !== undefined && { width: options.width }),
          ...(options.height !== undefined && { height: options.height }),
          ...(options.format !== undefined && { format: options.format }),
          printBackground: true,
          preferCSSPageSize: true,
          ...(cancellation && { signal: cancellation }),
        });
        assertPdfOutput(output, options.maxBytes);
        return output;
      }
      const index = await lstat(join(directory, "index.html"));
      if (!index.isFile() || index.isSymbolicLink())
        throw new Error(
          "Render source requires a regular index.html directory",
        );
      const server = await startStaticRenderServer({ rootDir: directory });
      const errors: unknown[] = [];
      let output: Buffer | undefined;
      try {
        if (request.format === "pdf") {
          output = await (deps.renderPdf ?? renderPdf)(server.urlFor("/"), {
            maxBytes: MAX_PDF_BYTES,
            timeoutMs: 60_000,
            printBackground: true,
            preferCSSPageSize: true,
            ...(cancellation && { signal: cancellation }),
          });
          assertPdfOutput(output, MAX_PDF_BYTES);
        } else {
          output = await (deps.screenshotPng ?? screenshotPng)(
            server.urlFor("/"),
            { width: 1200, height: 630 },
            {
              timeoutMs: 60_000,
              fullPage: false,
              omitBackground: false,
              ...(cancellation && { signal: cancellation }),
            },
          );
        }
      } catch (error) {
        errors.push(error);
      }
      try {
        await server.close();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          "Rendering and server retirement failed",
          { cause: errors[0] },
        );
      if (!output) throw new Error("Rendering returned no output");
      return output;
    },
    signal,
  );
}
