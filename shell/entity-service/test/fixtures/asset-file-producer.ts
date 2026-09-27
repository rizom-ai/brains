// Native test producer: the controller only exchanges file facts and metadata.
import { fileProduceSchema, produceFile } from "@brains/db/file-produce";
import { serializeError } from "@brains/db/error-protocol";
import type { BlobFacts } from "@brains/db/file-process-owner";

const cancellation = new AbortController();
process.on("disconnect", () => cancellation.abort());
process.once("message", (input: unknown) => {
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void (async (): Promise<BlobFacts> => {
    const request = fileProduceSchema.parse(input);
    const fill = request.metadata?.["fill"];
    if (fill !== "a5" && fill !== "7f" && fill !== "3c")
      throw new Error("Invalid fixture fill");
    return produceFile(
      request,
      async () =>
        new Uint8Array(2 * 1024 * 1024 + 7).fill(Number.parseInt(fill, 16)),
      cancellation.signal,
    );
  })().then(
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
