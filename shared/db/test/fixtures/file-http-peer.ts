// Test-only receipt and actual-exit gates; no production imports this peer.
import { fileHttpPutSchema } from "../../src/turso-worker/file-http-put";
import { serializeError } from "../../src/turso-worker/error-protocol";
let gate: string | undefined;
process.on("message", (value: unknown) => {
  if (gate) {
    void Bun.write(`${gate}.cancelled`, "cancel requested");
    return;
  }
  const input = fileHttpPutSchema.parse(value);
  gate = input.sourceFile;
  const path = gate;
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void (async (): Promise<void> => {
    await Bun.write(`${path}.entered`, "entered");
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
        details: { statusCode: mode === "/malformed" ? "201" : 201 },
      });
    }
    while (!(await Bun.file(`${path}.exit`).exists())) await Bun.sleep(5);
    process.disconnect();
  })();
});
