import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { z } from "@brains/utils/zod";

export const RENDER_REQUEST_FILE = "render.json";
export const MAX_PDF_BYTES: number = 25 * 1024 * 1024;
export const renderRequestSchema: z.ZodObject<{
  format: z.ZodEnum<{
    image: "image";
    pdf: "pdf";
    "preview-pdf": "preview-pdf";
  }>;
}> = z.strictObject({ format: z.enum(["image", "pdf", "preview-pdf"]) });
export type RenderRequest = z.output<typeof renderRequestSchema>;

/** Bounded actor-local metadata read. Neither a growing file nor a pipe can
 * turn the render instruction into an unbounded acquisition. Paths are trusted.
 */
export async function readRenderRequest(
  directory: string,
): Promise<RenderRequest> {
  return readRenderMetadata(
    directory,
    RENDER_REQUEST_FILE,
    128,
    renderRequestSchema,
  );
}

/** Internal actor metadata reader; fixed filenames/limits are selected by callers. */
export async function readRenderMetadata<T>(
  directory: string,
  filename: string,
  maxBytes: number,
  schema: z.ZodType<T>,
): Promise<T> {
  const file = await open(
    join(directory, filename),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const errors: unknown[] = [];
  let request: T | undefined;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes)
      throw new Error(
        `Render request requires a regular metadata file of at most ${maxBytes} bytes`,
      );
    const bytes = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        size,
        bytes.length - size,
        null,
      );
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > maxBytes)
      throw new Error("Render request exceeds its metadata limit");
    request = schema.parse(
      JSON.parse(bytes.subarray(0, size).toString("utf8")),
    );
  } catch (error) {
    errors.push(error);
  }
  try {
    await file.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Render request and metadata file cleanup failed",
      { cause: errors[0] },
    );
  if (request === undefined)
    throw new Error("Render request has no acknowledged outcome");
  return request;
}
