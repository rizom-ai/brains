import { fileProduceSchema } from "@brains/db/file-produce";
import { serializeError } from "@brains/db/error-protocol";
import { produceResponsiveImages } from "./responsive-image-file";

const cancellation = new AbortController();
let started = false;
if (!process.send)
  throw new Error("Responsive image production requires an IPC owner");
process.on("disconnect", () =>
  cancellation.abort(new Error("Responsive image owner disconnected")),
);
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(
      new Error("Responsive image production already started"),
    );
    return;
  }
  started = true;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void (async (): Promise<{ sizeBytes: number; sha256: string }> =>
    produceResponsiveImages(
      fileProduceSchema.parse(input),
      cancellation.signal,
    ))().then(
    (facts) => {
      process.send?.({ kind: "consumed", pid: process.pid, ...facts });
      process.disconnect();
    },
    (error: unknown) => {
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
