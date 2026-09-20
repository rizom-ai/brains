// Bulk HTTP I/O and hashing belong in this actor, never the controller.
import {
  fileHttpUploadRequestSchema,
  uploadHttpFile,
} from "./file-http-upload";
import { serializeError } from "./error-protocol";
import { z } from "@brains/utils/zod";

const cancelSchema = z.strictObject({ kind: z.literal("cancel") });
const cancellation = new AbortController();
let started = false;
if (!process.send) throw new Error("HTTP file upload requires an IPC owner");
process.on("disconnect", () =>
  cancellation.abort(new Error("HTTP file upload owner disconnected")),
);
process.on("message", (input: unknown) => {
  if (cancelSchema.safeParse(input).success) {
    cancellation.abort(
      new Error("HTTP file upload cancelled; remote outcome may be unknown"),
    );
    if (!started) {
      started = true;
      process.exitCode = 1;
      if (process.connected) process.disconnect();
    }
    return;
  }
  if (started) {
    cancellation.abort(new Error("HTTP file upload already started"));
    return;
  }
  started = true;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void (async (): Promise<void> => {
    const result = await uploadHttpFile(
      fileHttpUploadRequestSchema.parse(input),
      cancellation.signal,
    );
    // Do not retract an acknowledged receipt because cancellation arrived late.
    if (process.connected)
      process.send?.({
        kind: "consumed",
        pid: process.pid,
        sizeBytes: result.sizeBytes,
        sha256: result.sha256,
        details: { statusCode: result.statusCode },
      });
  })().then(
    () => {
      if (process.connected) process.disconnect();
    },
    (error: unknown) => {
      if (process.connected)
        process.send?.({
          kind: "failed",
          pid: process.pid,
          error: serializeError(error),
        });
      process.exitCode = 1;
      if (process.connected) process.disconnect();
    },
  );
});
