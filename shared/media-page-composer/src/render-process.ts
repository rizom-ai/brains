// A single-use Bun payload actor. No renderer bytes cross its IPC boundary.
import { fileProduceSchema } from "@brains/db/file-produce";
import { serializeError } from "@brains/db/error-protocol";
import { renderDirectoryFile } from "./render-file";

const cancellation = new AbortController();
let started = false;
process.on("disconnect", () =>
  cancellation.abort(new Error("Render owner disconnected")),
);
if (!process.send) throw new Error("Media rendering requires an IPC owner");
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(new Error("Rendering already started"));
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
    const errors: unknown[] = [];
    let result: Awaited<ReturnType<typeof renderDirectoryFile>> | undefined;
    try {
      result = await renderDirectoryFile(
        fileProduceSchema.parse(input),
        {},
        cancellation.signal,
      );
    } catch (error) {
      errors.push(error);
    }
    // Bun owns the browser internals. This requests their shutdown; it is NOT
    // an acknowledged descendant-process exit. The creator joins this Bun actor.
    try {
      Bun.WebView.closeAll();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "Render actor and WebView shutdown failed",
        { cause: errors[0] },
      );
    if (!result) throw new Error("Render actor returned no file facts");
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
