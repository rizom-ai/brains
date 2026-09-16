// PDF bytes, page scanning and temporary allocations stay in this credited actor.
import { extname } from "node:path";
import { uploadFile, fileUploadSchema } from "@brains/db/file-upload";
import { serializeError } from "@brains/db/error-protocol";
import { PdfFileInspection } from "./file-inspection";

const cancellation = new AbortController();
let started = false;
process.on("disconnect", () =>
  cancellation.abort(new Error("PDF inspection owner disconnected")),
);
if (!process.send) throw new Error("PDF inspection requires an IPC owner");
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(new Error("PDF inspection already started"));
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
    cancellation.signal.throwIfAborted();
    const extension = extname(options.sourceFile).slice(1).toLowerCase();
    if (extension && extension !== "pdf")
      throw new Error("PDF extension does not match its signature");
    // Allocate only after authenticated native transfer credit, not merely the
    // caller's size metadata or the owner's spawn request.
    const state: { inspector?: PdfFileInspection } = {};
    const facts = await uploadFile(options, {
      signal: cancellation.signal,
      ready: async (): Promise<void> => {
        state.inspector = new PdfFileInspection(options.size);
      },
      observe: (bytes): void => {
        if (!state.inspector)
          throw new Error("PDF inspection has no transfer credit");
        state.inspector.observe(bytes);
      },
    });
    cancellation.signal.throwIfAborted();
    if (!state.inspector)
      throw new Error("PDF inspection has no acknowledged transfer");
    const details = state.inspector.finish();
    process.send?.({ kind: "sealed", pid: process.pid, ...facts, details });
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
