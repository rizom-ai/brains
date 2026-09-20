import { fileProduceSchema } from "@brains/db/file-produce";
import { serializeError } from "@brains/db/error-protocol";
import {
  generateImageFile,
  type ImageGenerationFileDependencies,
} from "./image-generation-file";

/** Single-use actor entry. Only its creator joins actual process exit. */
export function runImageGenerationActor(
  sidecarUrl: string,
  deps: ImageGenerationFileDependencies = {},
): void {
  const cancellation = new AbortController();
  let started = false;
  if (!process.send)
    throw new Error("AI image generation requires an IPC owner");
  process.on("disconnect", () =>
    cancellation.abort(new Error("AI image owner disconnected")),
  );
  process.on("message", (input: unknown) => {
    if (started) {
      cancellation.abort(new Error("AI image generation already started"));
      return;
    }
    started = true;
    process.send?.({
      kind: "runtime",
      pid: process.pid,
      executable: process.execPath,
      sidecarUrl,
    });
    void (async (): Promise<{ sizeBytes: number; sha256: string }> =>
      generateImageFile(
        fileProduceSchema.parse(input),
        deps,
        cancellation.signal,
      ))().then(
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
}
