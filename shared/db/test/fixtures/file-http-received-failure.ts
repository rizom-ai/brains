// Inject an observer failure after the production transport verifies a receipt.
import {
  fileHttpUploadRequestSchema,
  uploadHttpFile,
} from "../../src/turso-worker/file-http-upload";
import { serializeError } from "../../src/turso-worker/error-protocol";
let started = false;
process.on("message", (value: unknown) => {
  if (started) return;
  started = true;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void uploadHttpFile(
    fileHttpUploadRequestSchema.parse(value),
    undefined,
    (result): void => {
      process.send?.({
        kind: "http-received",
        pid: process.pid,
        sizeBytes: result.sizeBytes,
        sha256: result.sha256,
        details: { statusCode: result.statusCode, ...result.responseMetadata },
      });
      throw new Error("injected receipt observer failure");
    },
  ).then(
    (): never => {
      throw new Error("Expected observer failure");
    },
    (error: unknown): void => {
      process.send?.({
        kind: "failed",
        pid: process.pid,
        error: serializeError(error),
      });
      process.exitCode = 1;
      process.disconnect();
    },
  );
});
