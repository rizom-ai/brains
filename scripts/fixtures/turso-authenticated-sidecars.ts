import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import { sidecarPath } from "../../shared/db/src/turso-worker/network-process-owner";

export const authenticatedSidecarsSchema: z.ZodObject<{
  nativeWorker: z.ZodString;
  readBridge: z.ZodString;
  consumer: z.ZodString;
  uploadBridge: z.ZodString;
  producer: z.ZodString;
  control: z.ZodString;
  bunExecutable: z.ZodString;
}> = z.strictObject({
  nativeWorker: z.string().min(1).max(4096),
  readBridge: z.string().min(1).max(4096),
  consumer: z.string().min(1).max(4096),
  uploadBridge: z.string().min(1).max(4096),
  producer: z.string().min(1).max(4096),
  control: z.string().min(1).max(4096),
  bunExecutable: z.string().min(1).max(4096),
});
export type AuthenticatedSidecars = z.output<
  typeof authenticatedSidecarsSchema
>;
export const authenticatedProfileSchema: z.ZodEnum<{
  full: "full";
  "consumer-kill": "consumer-kill";
}> = z.enum(["full", "consumer-kill"]);
export function resolveAuthenticatedSidecars(
  mode: "source" | "installed",
  encoded?: string,
): AuthenticatedSidecars {
  let input: unknown;
  if (mode === "source") {
    if (encoded !== undefined)
      throw new Error(
        "Source mode does not accept installed artifact overrides",
      );
    const native = (name: string): string =>
      new URL(
        [
          "worker",
          "network-ingress-worker",
          "network-read-worker",
          "transfer-receiver",
        ].includes(name)
          ? `../../shared/db/src/turso-worker/${name}.ts`
          : `../../shared/db/test/fixtures/turso-thread/${name}.ts`,
        import.meta.url,
      ).href;
    input = {
      nativeWorker: native("worker"),
      readBridge: native("network-read-worker"),
      consumer: native("network-read-consumer"),
      uploadBridge: native("network-ingress-worker"),
      producer: native("network-producer"),
      control: new URL("./turso-read-control-process.ts", import.meta.url).href,
      bunExecutable: process.execPath,
    };
  } else {
    if (encoded === undefined || Buffer.byteLength(encoded) > 32 * 1024)
      throw new Error(
        "Installed authenticated proof requires bounded explicit sidecars",
      );
    input = JSON.parse(encoded);
  }
  const options = authenticatedSidecarsSchema.parse(input);
  for (const url of [
    options.nativeWorker,
    options.readBridge,
    options.consumer,
    options.uploadBridge,
    options.producer,
    options.control,
  ])
    sidecarPath(new URL(url));
  if (!isAbsolute(options.bunExecutable))
    throw new Error(
      "Authenticated proof requires an explicit absolute Bun executable",
    );
  return options;
}
