import { test, expect } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EntityBinaryClient,
  EntityFileRuntime,
  ReceivedEntityFileHttpError,
} from "@brains/entity-service";
import { AtprotoPdsClient, ReceivedAtprotoBlobError } from "@brains/atproto";
import { collectAtprotoBlobEvidence } from "@brains/atproto-contracts";

test("native HTTP failure crosses the public file API as received PDS evidence, never completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-http-bridge-"));
  const sourceFile = join(directory, "source.bin");
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await writeFile(sourceFile, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let uploads = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request): Promise<Response> => {
      if (new URL(request.url).pathname.endsWith("createSession"))
        return Response.json({
          did: "did:plc:test",
          handle: "fixture.test",
          accessJwt: "private-token",
          refreshJwt: "private-refresh",
        });
      uploads++;
      assert.equal(
        request.headers.get("authorization"),
        "Bearer private-token",
      );
      // Independent fixture-provider verification, not a controller transport fallback.
      assert.equal(
        createHash("sha256")
          .update(new Uint8Array(await request.arrayBuffer()))
          .digest("hex"),
        sha256,
      );
      return Response.json(
        {
          blob: {
            ref: { $link: "received-cid" },
            mimeType: "image/png",
            size: bytes.length,
          },
          private: "private-provider-data",
        },
        { status: 201 },
      );
    },
  });
  const actor = new URL(
    "../shared/db/test/fixtures/file-http-received-failure.ts",
    import.meta.url,
  );
  const files = new EntityFileRuntime(
    new EntityBinaryClient({
      transport: {
        control: async (): Promise<never> => {
          throw new Error("Unexpected binary control");
        },
        publication: async (): Promise<never> => {
          throw new Error("Unexpected publication");
        },
        invalidate: (): never => {
          throw new Error("Unexpected binary fence");
        },
      },
    }),
    {
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      inspectionUploadUrl: actor,
      httpUploadUrl: actor,
    },
  );
  const client = new AtprotoPdsClient({
    pdsEndpoint: server.url.origin,
    identifier: "fixture",
    appPassword: "fixture",
    getFileTransfers: (): EntityFileRuntime => files,
  });
  try {
    await assert.rejects(
      client.uploadBlob({
        sourceFile,
        sizeBytes: bytes.length,
        sha256,
        mimeType: "image/png",
        signal: new AbortController().signal,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ReceivedAtprotoBlobError);
        assert.ok(error.cause instanceof ReceivedEntityFileHttpError);
        assert.equal(error.receipt.blob.ref.$link, "received-cid");
        const recovery = collectAtprotoBlobEvidence(error);
        assert.equal(recovery?.nodes[0]?.status, "received");
        assert.equal(recovery.nodes[0].receipts?.[0]?.sha256, sha256);
        assert.equal(recovery.truncated, false);
        assert.ok(!JSON.stringify(recovery).includes("private"));
        return true;
      },
    );
    expect(uploads).toBe(1);
  } finally {
    try {
      await files.close();
    } finally {
      await server.stop(true);
    }
    // Retain the failed delivery source as diagnostic fixture evidence.
  }
});
