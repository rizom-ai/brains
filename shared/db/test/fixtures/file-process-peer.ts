// Test-only peer with a deterministic actual-exit gate. Source never imports it.
import { fileUploadSchema } from "../../src/turso-worker/file-upload";
import {
  fileProduceSchema,
  produceFile,
} from "../../src/turso-worker/file-produce";
import { serializeError } from "../../src/turso-worker/error-protocol";
let gate: string | undefined;
process.on("SIGTERM", () => {
  if (gate) void Bun.write(`${gate}.terminated`, "requested");
});
process.on("message", (input: unknown) => {
  void (async (): Promise<void> => {
    const upload = fileUploadSchema.safeParse(input);
    gate = upload.success
      ? upload.data.sourceFile
      : fileProduceSchema.parse(input).sourceDirectory;
    process.send?.({
      kind: "runtime",
      pid: process.pid,
      executable: process.execPath,
      sidecarUrl: import.meta.url,
    });
    const facts = upload.success
      ? { sizeBytes: upload.data.size, sha256: "a".repeat(64) }
      : await produceFile(
          fileProduceSchema.parse(input),
          async () => new Uint8Array([7, 8, 9]),
        );
    process.send?.({
      kind: upload.success ? "sealed" : "consumed",
      pid: process.pid,
      ...facts,
    });
    const timer = setInterval(() => {
      void (async (): Promise<void> => {
        if (gate && (await Bun.file(`${gate}.exit`).exists())) {
          clearInterval(timer);
          process.disconnect();
        }
      })();
    }, 5);
  })().catch((error: unknown) => {
    process.send?.({
      kind: "failed",
      pid: process.pid,
      error: serializeError(error),
    });
    process.exitCode = 1;
    process.disconnect();
  });
});
