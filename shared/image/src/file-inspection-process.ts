// File bytes and inspection stay in this credited upload actor.
import { extname } from "node:path";
import { uploadFile, fileUploadSchema } from "@brains/db/file-upload";
import { serializeError } from "@brains/db/error-protocol";
import { StreamImageInspection } from "./stream-image-inspection";
const cancellation = new AbortController();
let started = false;
process.on("disconnect", () =>
  cancellation.abort(new Error("Image inspection owner disconnected")),
);
if (!process.send) throw new Error("Image inspection requires an IPC owner");
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(new Error("Image inspection already started"));
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
    const options = fileUploadSchema.parse(input);
    const inspector = new StreamImageInspection();
    const facts = await uploadFile(options, {
      signal: cancellation.signal,
      observe: (bytes): void => inspector.observe(bytes),
    });
    const details = inspector.finish();
    const extension = extname(options.sourceFile).slice(1).toLowerCase();
    if ((extension === "jpg" ? "jpeg" : extension) !== details.format)
      throw new Error("Image extension does not match its signature");
    process.send?.({ kind: "sealed", pid: process.pid, ...facts, details });
  })().then(
    () => {
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
