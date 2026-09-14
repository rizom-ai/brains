// Separate payload process. IPC carries metadata only; file publication is actor-owned.
import { z } from "@brains/utils/zod";
import { fileDownloadSchema, downloadFile } from "./file-download";
import { readPauseAfterSchema } from "./network-read-protocol";
import { STAGE_CHUNK_BYTES } from "./binary-protocol";
import { serializeError } from "./error-protocol";

const startSchema = fileDownloadSchema.extend({
  pause: z.boolean().default(false),
  pauseAfterBytes: readPauseAfterSchema.default(STAGE_CHUNK_BYTES),
});
const resumeSchema = z.strictObject({ kind: z.literal("resume") });
const cancellation = new AbortController();
let started = false;
let stopped = false;
let gate: ReturnType<typeof Promise.withResolvers<void>> | undefined;
function cancel(error: unknown): void {
  if (stopped) return;
  cancellation.abort(error);
  gate?.reject(error);
}
function disconnect(): void {
  stopped = true;
  if (process.connected) process.disconnect();
}
async function run(input: unknown): Promise<void> {
  const { pause, pauseAfterBytes, ...options } = startSchema.parse(input);
  const facts = await downloadFile(options, {
    signal: cancellation.signal,
    pauseAfterBytes,
    ready: async (prefix): Promise<void> => {
      if (!pause) return;
      const pending = Promise.withResolvers<void>();
      gate = pending;
      process.send?.({ kind: "chunk-held", ...prefix, pid: process.pid });
      try {
        await pending.promise;
      } finally {
        gate = undefined;
      }
    },
  });
  cancellation.signal.throwIfAborted();
  process.send?.({ kind: "consumed", ...facts, pid: process.pid });
}
if (!process.send)
  throw new Error("File download process requires an IPC owner");
process.on("disconnect", () =>
  cancel(new Error("File download IPC owner disconnected")),
);
process.on("message", (input: unknown) => {
  if (started) {
    try {
      resumeSchema.parse(input);
      if (!gate)
        throw new Error("File download process is not awaiting resume");
      gate.resolve();
      gate = undefined;
    } catch (error) {
      cancel(error);
    }
    return;
  }
  started = true;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void run(input).then(disconnect, (error: unknown) => {
    if (process.connected)
      process.send?.({
        kind: "failed",
        error: serializeError(error),
        pid: process.pid,
      });
    process.exitCode = 1;
    disconnect();
  });
});
