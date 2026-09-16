import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { produceFile, type FileProduceInput } from "@brains/db/file-produce";
import type { BlobFacts } from "@brains/db/file-process-owner";
import { screenshotPng, renderPdf } from "@brains/media-renderer";
import { readRenderRequest, MAX_PDF_BYTES } from "./render-request";
import { startStaticRenderServer } from "./media-render-page";

/** SDK injection is actor-local, never a controller-side buffer handoff. */
export interface RenderDirectoryDeps {
  screenshotPng?: typeof screenshotPng;
  renderPdf?: typeof renderPdf;
}
/** Render an index.html + assets + render.json directory to a no-replace file. Called
 * only in a payload actor; HTML serving, WebView buffers and hashing stay here.
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
      const index = await lstat(join(directory, "index.html"));
      if (
        !root.isDirectory() ||
        root.isSymbolicLink() ||
        !index.isFile() ||
        index.isSymbolicLink()
      )
        throw new Error(
          "Render source requires a regular index.html directory",
        );
      const request = await readRenderRequest(directory);
      cancellation?.throwIfAborted();
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
          if (output.length > MAX_PDF_BYTES)
            throw new Error("Rendered PDF exceeds its size limit");
          if (!output.subarray(0, 5).equals(Buffer.from("%PDF-")))
            throw new Error("Rendered output has no PDF signature");
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
