import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { z } from "@brains/utils/zod";

export const RENDER_REQUEST_FILE = "render.json";
export const MAX_PDF_BYTES: number = 25 * 1024 * 1024;
export const renderRequestSchema: z.ZodObject<{
  format: z.ZodEnum<{ image: "image"; pdf: "pdf" }>;
}> = z.strictObject({ format: z.enum(["image", "pdf"]) });
export type RenderRequest = z.output<typeof renderRequestSchema>;

/** Bounded actor-local metadata read. Neither a growing file nor a pipe can
 * turn the render instruction into an unbounded acquisition. Paths are trusted.
 */
export async function readRenderRequest(
  directory: string,
): Promise<RenderRequest> {
  const file = await open(
    join(directory, RENDER_REQUEST_FILE),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  const errors: unknown[] = [];
  let request: RenderRequest | undefined;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 128)
      throw new Error(
        "Render request requires a regular metadata file of at most 128 bytes",
      );
    const bytes = Buffer.alloc(129);
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
    if (size > 128)
      throw new Error("Render request exceeds its metadata limit");
    request = renderRequestSchema.parse(
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
  if (!request) throw new Error("Render request has no acknowledged outcome");
  return request;
}
