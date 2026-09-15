// HTTP, decompression, inspection and hashing are confined to this owned actor.
import { fetchFile, fileFetchSchema } from "@brains/db/file-fetch";
import { serializeError } from "@brains/db/error-protocol";
import { StreamImageInspection } from "./stream-image-inspection";
const cancellation = new AbortController();
let started = false;
process.on("disconnect", () =>
  cancellation.abort(new Error("Remote image owner disconnected")),
);
if (!process.send)
  throw new Error("Remote image download requires an IPC owner");
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(new Error("Remote image download already started"));
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
    const inspector = new StreamImageInspection();
    const result = await fetchFile(
      fileFetchSchema.parse(input),
      {
        accept: (mediaType): void => {
          if (!mediaType.startsWith("image/"))
            throw new Error("URL does not point to expected content type");
        },
        observe: (bytes): void => inspector.observe(bytes),
        finish: (mediaType) => {
          const details = inspector.finish();
          if (details.mediaType !== mediaType)
            throw new Error(
              "Remote image media type does not match its inspected signature",
            );
          return details;
        },
      },
      cancellation.signal,
    );
    process.send?.({ kind: "consumed", pid: process.pid, ...result });
  })().then(
    () => process.disconnect(),
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
