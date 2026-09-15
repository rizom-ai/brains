import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { produceFile, type FileProduceInput } from "@brains/db/file-produce";
import type { BlobFacts } from "@brains/db/file-process-owner";
import { screenshotPng } from "@brains/media-renderer";
import { startStaticRenderServer } from "./media-render-page";
import type { ScreenshotPng } from "./og-image";

/** SDK injection is actor-local, never a controller-side buffer handoff. */
export interface RenderDirectoryDeps {
  screenshotPng?: ScreenshotPng;
}
/** Render an index.html + assets directory to a no-replace PNG output. Called
 * only in a payload actor; HTML serving, WebView buffers and hashing stay here.
 */
export async function renderDirectoryPng(
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
      const server = await startStaticRenderServer({ rootDir: directory });
      const errors: unknown[] = [];
      let output: Buffer | undefined;
      try {
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
