import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  EntityFileAssets,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import { RENDER_REQUEST_FILE } from "./render-request";
import {
  previewPdfRequestSchema,
  PREVIEW_PDF_REQUEST_FILE,
  PREVIEW_PDF_METADATA_BYTES,
  type PreviewPdfInput,
} from "./preview-pdf-request";

export interface PreviewPdfOptions {
  signal?: AbortSignal | undefined;
}
/** Controller metadata only. Rendering/hashing run in the existing producer;
 * inputs stay owned through the producer and consumer, and failures retain them.
 */
export async function withPreviewPdfFile<T>(
  input: PreviewPdfInput,
  files: Pick<EntityFileAssets, "withProducedFile">,
  use: (file: EntityVerifiedFileSource, signal: AbortSignal) => Promise<T>,
  options?: PreviewPdfOptions,
): Promise<T> {
  options?.signal?.throwIfAborted();
  if (!files.withProducedFile)
    throw new Error("Preview PDF rendering is not provisioned");
  const request = previewPdfRequestSchema.parse(input);
  const metadata = JSON.stringify(request);
  if (Buffer.byteLength(metadata) > PREVIEW_PDF_METADATA_BYTES)
    throw new Error("Preview PDF request exceeds its metadata limit");
  const directory = await mkdtemp(join(tmpdir(), "brain-preview-pdf-"));
  await writeFile(
    join(directory, RENDER_REQUEST_FILE),
    JSON.stringify({ format: "preview-pdf" }),
  );
  await writeFile(join(directory, PREVIEW_PDF_REQUEST_FILE), metadata);
  options?.signal?.throwIfAborted();
  const result = await files.withProducedFile(directory, use, options);
  // A late abort cannot retract an acknowledged consumer outcome.
  await rm(directory, { recursive: true });
  return result;
}
