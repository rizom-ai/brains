import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  EntityBinaryClient,
  EntityFileRuntime,
  type EntityServiceClient,
} from "@brains/entity-service";
import { UploadInspection } from "@brains/plugins/message-interface/upload-inspection";

export interface UploadFileFixture {
  source(bytes: Uint8Array, mediaType?: string): string;
  requests: Array<{ path: string; authorization: string | null }>;
  close(): Promise<void>;
}

/** Real admitted native HTTP capture. Inspection is an explicit unit substitute;
 * production inspector ownership and memory are not claimed by this fixture. */
export function installUploadFileFixture(
  service: Pick<EntityServiceClient, "fileAssets">,
): UploadFileFixture {
  const sources = new Map<string, { bytes: Uint8Array; mediaType: string }>();
  const requests: UploadFileFixture["requests"] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request): Response {
      const path = new URL(request.url).pathname;
      requests.push({
        path,
        authorization: request.headers.get("authorization"),
      });
      const source = sources.get(path);
      return source
        ? new Response(new Uint8Array(source.bytes), {
            headers: { "content-type": source.mediaType },
          })
        : new Response(null, { status: 404 });
    },
  });
  const unexpected = (): never => {
    throw new Error("Unexpected upload fixture operation");
  };
  const actor = new URL(
    "../../../../shared/db/src/turso-worker/file-capture-process.ts",
    import.meta.url,
  );
  const runtime = new EntityFileRuntime(
    new EntityBinaryClient({
      transport: {
        control: unexpected,
        publication: unexpected,
        invalidate: unexpected,
      },
    }),
    {
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      inspectionUploadUrl: actor,
      captureUrl: actor,
    },
  );
  service.fileAssets = {
    withCapturedFile: (source, use, options): ReturnType<typeof use> =>
      runtime.withCapturedFile(source, use, options),
    inspect: async (
      source,
      options,
    ): ReturnType<EntityFileRuntime["inspect"]> => {
      if (options?.inspector !== "message-upload") unexpected();
      options?.signal?.throwIfAborted();
      const bytes = await readFile(source.sourceFile);
      if (bytes.byteLength !== source.sizeBytes)
        throw new Error("Fixture inspection size mismatch");
      const inspection = new UploadInspection(bytes.length);
      for (let offset = 0; offset < bytes.length; offset += 32768)
        inspection.observe(bytes.subarray(offset, offset + 32768));
      const details = inspection.finish();
      return {
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        details: {
          validText: details.validText,
          ...(details.binaryMediaType
            ? { binaryMediaType: details.binaryMediaType }
            : {}),
        },
      };
    },
    withAssetFile: unexpected,
    putHttp: unexpected,
    postHttp: unexpected,
    publish: unexpected,
    fingerprint: unexpected,
    download: unexpected,
    close: (): Promise<void> => runtime.close(),
  };
  return {
    requests,
    source: (bytes, mediaType = "application/octet-stream"): string => {
      const path = `/source-${sources.size}`;
      sources.set(path, { bytes, mediaType });
      return `http://127.0.0.1:${server.port}${path}`;
    },
    close: async (): Promise<void> => {
      await runtime.close();
      await server.stop(true);
    },
  };
}
