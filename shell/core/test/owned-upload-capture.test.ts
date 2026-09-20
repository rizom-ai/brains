import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EntityBinaryClient,
  EntityFileRuntime,
  type EntityFileAssets,
} from "@brains/entity-service";
import { captureRuntimeUpload, RuntimeUploadRegistry } from "@brains/plugins";

test("owned authenticated capture retains a complete upload after native exit and producer staging cleanup", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "owned-upload-capture-"));
  const bytes = Buffer.from("%PDF-1.4\nfixture bytes\n".repeat(4096));
  const digest = createHash("sha256").update(bytes).digest("hex");
  const credentials: Array<string | undefined> = [];
  const server = createServer((request, response) => {
    credentials.push(request.headers.authorization);
    if (request.url === "/start")
      response.writeHead(302, { location: "/file" }).end();
    else
      response
        .writeHead(200, {
          "content-type": "application/pdf",
          "content-encoding": "gzip",
        })
        .end(gzipSync(bytes));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const actor = new URL(import.meta.resolve("@brains/db/file-capture-process"));
  const unexpected = async (): Promise<never> => {
    throw new Error(
      "Unexpected entity publication or binary authority acquisition",
    );
  };
  const runtime = new EntityFileRuntime(
    new EntityBinaryClient({
      transport: {
        control: unexpected,
        publication: unexpected,
        invalidate: (): never => {
          throw new Error("Unexpected fence");
        },
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
  const store = RuntimeUploadRegistry.createFresh({ dataDir }).scoped({
    namespace: "upload",
    refKind: "upload",
    routePath: "/uploads",
  });
  let capturedPath = "";
  let inode = 0n;
  const files: Pick<EntityFileAssets, "withCapturedFile"> = {
    withCapturedFile: (input, use, options) =>
      runtime.withCapturedFile(
        input,
        async (file, signal) => {
          capturedPath = file.sourceFile;
          inode = (await stat(file.sourceFile, { bigint: true })).ino;
          expect(file.sha256).toBe(digest);
          expect(file.sizeBytes).toBe(bytes.length);
          return use(file, signal);
        },
        options,
      ),
  };
  try {
    const record = await captureRuntimeUpload(
      {
        source: {
          url: `http://127.0.0.1:${address.port}/start`,
          authorization: "Bearer fixture",
          maxBytes: bytes.length,
        },
        filename: "file.pdf",
        mediaType: "application/pdf",
        metadata: { interfaceType: "fixture" },
      },
      files,
      store,
    );
    expect(credentials).toEqual(["Bearer fixture", "Bearer fixture"]);
    expect(record.sizeBytes).toBe(bytes.length);
    expect(await Bun.file(capturedPath).exists()).toBe(false);
    expect(await store.readRecord(record.id)).toEqual(record);
    expect(
      (
        await stat(join(store.getUploadDir(record.id), "content"), {
          bigint: true,
        })
      ).ino,
    ).toBe(inode);
    await store.withFile(record.id, async ({ sourceFile }): Promise<void> => {
      await store.remove(record.id);
      expect(await readFile(sourceFile)).toEqual(bytes);
    });
  } finally {
    await runtime.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(dataDir, { recursive: true });
  }
});
