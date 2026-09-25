import type { FileHttpUploadResult } from "@brains/db/file-process-owner";

/** Public file-capability failure, not completion or retry authority.
 * Selected provider metadata still requires domain validation before reporting.
 */
export class ReceivedEntityFileHttpError extends Error {
  public readonly outcome: Readonly<FileHttpUploadResult>;

  constructor(outcome: FileHttpUploadResult, cause: unknown) {
    super("HTTP receipt received but file delivery failed", { cause });
    this.name = "ReceivedEntityFileHttpError";
    this.outcome = Object.freeze({
      sizeBytes: outcome.sizeBytes,
      sha256: outcome.sha256,
      statusCode: outcome.statusCode,
      ...(outcome.responseMetadata && {
        responseMetadata: Object.freeze({ ...outcome.responseMetadata }),
      }),
    });
  }
}
