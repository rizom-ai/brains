// Test-only deterministic PDF producer. All payload allocation/hashing stays here.
import { createHash } from "node:crypto";
import { fileProduceSchema } from "../../shared/db/src/turso-worker/file-produce";
import { withFileTarget } from "../../shared/db/src/turso-worker/file-target";
import { serializeError } from "../../shared/db/src/turso-worker/error-protocol";

const SIZE = 100 * 1024 * 1024;
const cancellation = new AbortController();
let started = false;
if (!process.send) throw new Error("Large fixture requires an IPC owner");
process.on("disconnect", () =>
  cancellation.abort(new Error("Owner disconnected")),
);
process.on("message", (input: unknown) => {
  if (started) {
    cancellation.abort(new Error("Producer already started"));
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
    const request = fileProduceSchema.parse(input);
    const objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Contents 4 0 R >>\nendobj\n",
      "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
    ];
    let header = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (const object of objects) {
      offsets.push(header.length);
      header += object;
    }
    const trailer = (offset: number): string =>
      `xref\n0 5\n0000000000 65535 f \n${offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    const xrefOffset = SIZE - trailer(SIZE).length;
    const footer = trailer(xrefOffset);
    if (xrefOffset + footer.length !== SIZE)
      throw new Error("Unstable PDF offset");
    return withFileTarget(
      { path: request.outputFile, maxBytes: SIZE },
      async (target) => {
        const hash = createHash("sha256");
        const write = async (bytes: Uint8Array): Promise<void> => {
          hash.update(bytes);
          await target.write(bytes);
        };
        await write(Buffer.from(header));
        const chunk = Buffer.from(`%${"Z".repeat(32766)}\n`);
        let remaining = xrefOffset - header.length;
        while (remaining > 0) {
          cancellation.signal.throwIfAborted();
          const length = Math.min(chunk.length, remaining);
          await write(
            length === chunk.length
              ? chunk
              : Buffer.from(
                  length === 1 ? "\n" : `%${"Z".repeat(length - 2)}\n`,
                ),
          );
          remaining -= length;
        }
        await write(Buffer.from(footer));
        return { sizeBytes: SIZE, sha256: hash.digest("hex") };
      },
      cancellation.signal,
    );
  })().then(
    (facts) => {
      if (process.connected) {
        process.send?.({ kind: "consumed", pid: process.pid, ...facts });
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
