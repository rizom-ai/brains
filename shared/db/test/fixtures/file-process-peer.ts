// Metadata-only peer with a deterministic actual-exit gate. Never imported by source.
import { fileUploadSchema } from "../../src/turso-worker/file-upload";
let gate: string | undefined;
process.on("SIGTERM", () => {
  if (gate) void Bun.write(`${gate}.terminated`, "requested");
});
process.on("message", (input: unknown) => {
  const options = fileUploadSchema.parse(input);
  gate = options.sourceFile;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  process.send?.({
    kind: "sealed",
    pid: process.pid,
    sizeBytes: options.size,
    sha256: "a".repeat(64),
  });
  const timer = setInterval(() => {
    void (async (): Promise<void> => {
      if (gate && (await Bun.file(`${gate}.exit`).exists())) {
        clearInterval(timer);
        process.disconnect();
      }
    })();
  }, 5);
});
