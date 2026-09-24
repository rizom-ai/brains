// Test-only receipt and actual-exit gates; no production imports this peer.
import { fileHttpUploadRequestSchema } from "../../src/turso-worker/file-http-upload";
import { serializeError } from "../../src/turso-worker/error-protocol";
let gate: string | undefined;
process.on("message", (value: unknown) => {
  if (gate) {
    void Bun.write(`${gate}.cancelled`, "cancel requested");
    return;
  }
  const { input, method } = fileHttpUploadRequestSchema.parse(value);
  gate = input.sourceFile;
  const path = gate;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void (async (): Promise<void> => {
    await Bun.write(`${path}.entered`, method);
    while (!(await Bun.file(`${path}.receipt`).exists())) await Bun.sleep(5);
    const mode = new URL(input.url).pathname;
    if (mode === "/failure") {
      process.send?.({
        kind: "failed",
        pid: process.pid,
        error: serializeError(new Error("remote transfer failed")),
      });
      process.exitCode = 1;
    } else if (mode !== "/missing") {
      process.send?.({
        kind: "consumed",
        pid: process.pid,
        ...input.facts,
        details: {
          statusCode: mode === "/malformed" ? "201" : 201,
          ...(input.responseMetadata &&
            mode !== "/metadata-missing" &&
            Object.fromEntries(
              Object.keys(input.responseMetadata).map((key) => [
                key,
                mode === "/metadata-total"
                  ? "\u0000".repeat(1024)
                  : mode === "/metadata-oversized"
                    ? "x".repeat(1025)
                    : "receipt",
              ]),
            )),
          ...(mode === "/metadata-extra" && { extra: "unexpected" }),
        },
      });
    }
    while (!(await Bun.file(`${path}.exit`).exists())) await Bun.sleep(5);
    if (mode === "/bad-exit") process.exitCode = 7;
    if (mode === "/duplicate") {
      process.send?.({
        kind: "consumed",
        pid: process.pid,
        ...input.facts,
        details: { statusCode: 202 },
      });
      // Keep the peer alive until the owner fences it.
      await Bun.sleep(1000);
    }
    process.disconnect();
  })();
});
