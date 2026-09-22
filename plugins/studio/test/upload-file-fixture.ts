import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServicePluginContext } from "@brains/plugins";

/** Explicit unit capture substitute; real native ingress is covered by the
 * shared/web-chat transport tests and canonical App fixture. */
export function provisionUploadCapture(
  service: Pick<ServicePluginContext["entityService"], "fileAssets">,
): void {
  const unexpected = (): never => {
    throw new Error("Unexpected file fixture operation");
  };
  service.fileAssets = {
    withCapturedFile: async (input, use, options): ReturnType<typeof use> => {
      const signal = options?.signal ?? new AbortController().signal;
      signal.throwIfAborted();
      const response = await fetch(input.url, {
        signal,
        headers: { authorization: input.authorization ?? "" },
      });
      if (!response.ok) throw new Error("Fixture capture rejected");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (input.maxBytes !== undefined && bytes.length > input.maxBytes)
        throw Object.assign(new Error("Fixture capture too large"), {
          code: "FILE_SIZE_LIMIT",
        });
      const directory = await mkdtemp(
        join(tmpdir(), "studio-capture-fixture-"),
      );
      const sourceFile = join(directory, "file");
      try {
        await writeFile(sourceFile, bytes, { flag: "wx" });
        return await use(
          {
            sourceFile,
            sizeBytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            details: {
              mediaType:
                response.headers.get("content-type") ??
                "application/octet-stream",
            },
          },
          signal,
        );
      } finally {
        await rm(directory, { recursive: true });
      }
    },
    inspect: unexpected,
    publish: unexpected,
    fingerprint: unexpected,
    download: unexpected,
    withAssetFile: unexpected,
    putHttp: unexpected,
    postHttp: unexpected,
    close: async (): Promise<void> => undefined,
  };
}
