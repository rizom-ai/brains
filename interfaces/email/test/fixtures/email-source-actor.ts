import { readFile, writeFile } from "node:fs/promises";
import { fileProduceSchema } from "@brains/db/file-produce";
import { serializeError } from "@brains/db/error-protocol";
import {
  produceEmailSource,
  type EmailSourceReader,
} from "../../src/email-source-actor";

const cancellation = new AbortController();
let started = false;
process.on("disconnect", () =>
  cancellation.abort(new Error("Fixture owner disconnected")),
);
process.on("message", (value: unknown) => {
  if (started) {
    cancellation.abort(new Error("Fixture source cancelled"));
    return;
  }
  started = true;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void (async (): Promise<{ sizeBytes: number; sha256: string }> => {
    const input = fileProduceSchema.parse(value);
    const reader: EmailSourceReader = async (request, signal) => {
      await writeFile(`${input.outputFile}.pid`, String(process.pid), {
        flag: "wx",
      });
      if (request.config.user === "wait")
        await new Promise<void>((_resolve, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      // Explicit test-only provider substitution. Production uses IMAP, not paths.
      return {
        uid: request.uid,
        source: await readFile(request.config.password),
        receivedAt: new Date("2026-04-15T09:00:00Z"),
        threadId: "fixture-thread",
      };
    };
    return produceEmailSource(input, cancellation.signal, reader);
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
