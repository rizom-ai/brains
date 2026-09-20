// Generic incoming payloads stay in this explicitly provisioned actor.
import { captureFile, type FileCaptureResult } from "./file-capture";
import { fileFetchSchema } from "./file-fetch";
import { serializeError } from "./error-protocol";

const cancellation = new AbortController();
let started = false;
if (!process.send) throw new Error("File capture requires an IPC owner");
process.on("disconnect", () =>
  cancellation.abort(new Error("File capture owner disconnected")),
);
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(new Error("File capture already started"));
    return;
  }
  started = true;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void (async (): Promise<FileCaptureResult> =>
    captureFile(fileFetchSchema.parse(input), cancellation.signal))().then(
    (result) => {
      if (process.connected) {
        process.send?.({ kind: "consumed", pid: process.pid, ...result });
        process.disconnect();
      }
    },
    (error: unknown) => {
      if (process.connected) {
        process.send?.({
          kind: "failed",
          pid: process.pid,
          error: serializeError(error),
        });
        process.disconnect();
      }
      process.exitCode = 1;
    },
  );
});
