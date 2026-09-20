import { z } from "@brains/utils/zod";
import { fetchFile, type FileFetchInput } from "./file-fetch";
import type { BlobFacts } from "./blob-protocol";

export interface FileCaptureDetails {
  /** Server-declared hint, not inspection or proof of content type. */
  mediaType: string;
}
export interface FileCaptureResult extends BlobFacts {
  details: FileCaptureDetails;
}
const mediaTypeSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/);
export const fileCaptureDetailsSchema: z.ZodType<FileCaptureDetails> =
  z.strictObject({ mediaType: mediaTypeSchema });

/** Actor-only generic ingress. Actual document/image inspection belongs to
 * promotion, not to an untrusted Content-Type header or a caller's filename.
 */
export function captureFile(
  input: FileFetchInput,
  signal?: AbortSignal,
): Promise<FileCaptureResult> {
  return fetchFile(
    input,
    {
      accept: (mediaType): void => {
        if (mediaType) mediaTypeSchema.parse(mediaType);
      },
      observe: (): void => undefined,
      finish: (mediaType): FileCaptureDetails => ({
        mediaType: mediaType || "application/octet-stream",
      }),
    },
    signal,
  );
}
