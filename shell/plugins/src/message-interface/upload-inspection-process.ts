// Credited upload signature/UTF-8 inspection. Never loaded by a controller.
import { uploadFile, fileUploadSchema } from "@brains/db/file-upload";
import { serializeError } from "@brains/db/error-protocol";
import { UploadInspection } from "./upload-inspection";

const cancellation = new AbortController();
let started = false;
process.on("disconnect", () =>
  cancellation.abort(new Error("Upload inspection owner disconnected")),
);
if (!process.send) throw new Error("Upload inspection requires an IPC owner");
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(new Error("Upload inspection already started"));
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
    const state: { inspector?: UploadInspection } = {};
    const facts = await uploadFile(options, {
      signal: cancellation.signal,
      ready: async (): Promise<void> => {
        state.inspector = new UploadInspection(options.size);
      },
      observe: (bytes): void => {
        if (!state.inspector)
          throw new Error("Upload inspection has no transfer credit");
        state.inspector.observe(bytes);
      },
    });
    cancellation.signal.throwIfAborted();
    if (!state.inspector)
      throw new Error("Upload inspection has no acknowledged transfer");
    process.send?.({
      kind: "sealed",
      pid: process.pid,
      ...facts,
      details: state.inspector.finish(),
    });
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
