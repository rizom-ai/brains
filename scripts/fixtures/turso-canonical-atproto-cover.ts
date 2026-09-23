import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spyOn } from "bun:test";
import type { App } from "@brains/app";
import type { BaseEntity } from "@brains/plugins";
import { createBlogAtprotoProjection } from "@brains/blog";
import { AtprotoPdsClient } from "@brains/atproto";

/** Production projection, inspection, loan and native POST; only the remote PDS
 * is substituted. This is not real-provider or installed provisioning evidence.
 */
export async function publishCanonicalAtprotoCover(
  app: App,
  entity: BaseEntity,
  digest: string,
  sizeBytes: number,
): Promise<void> {
  const service = app.getShell().getEntityService();
  const files = service.fileAssets;
  assert.ok(files);
  let uploads = 0;
  const peer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      if (new URL(request.url).pathname.endsWith("createSession"))
        return Response.json({
          did: "did:plc:fixture",
          handle: "fixture.test",
          accessJwt: "fixture-token",
          refreshJwt: "fixture-refresh",
        });
      assert.equal(
        new URL(request.url).pathname,
        "/xrpc/com.atproto.repo.uploadBlob",
      );
      assert.equal(request.method, "POST");
      assert.equal(
        request.headers.get("authorization"),
        "Bearer fixture-token",
      );
      assert.equal(request.headers.get("content-type"), "image/png");
      // Independent remote peer verification; never a production buffer fallback.
      const bytes = await request.arrayBuffer();
      assert.equal(bytes.byteLength, sizeBytes);
      assert.equal(
        createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
        digest,
      );
      uploads++;
      return Response.json({
        blob: {
          $type: "blob",
          ref: { $link: "fixture-cid" },
          mimeType: "image/png",
          size: sizeBytes,
        },
      });
    },
  });
  const reads = spyOn(service, "readAsset").mockImplementation(
    async (): Promise<never> => {
      throw new Error("Controller AT Protocol image buffering is forbidden");
    },
  );
  const posts = spyOn(files, "postHttp");
  try {
    const client = new AtprotoPdsClient({
      pdsEndpoint: peer.url.href,
      identifier: "fixture",
      appPassword: "fixture",
      getFileTransfers: (): typeof files => files,
    });
    const result = await createBlogAtprotoProjection().buildRecord({
      entity,
      context: { entityService: service },
      config: {},
      client,
    });
    assert.deepEqual(result.coverImage?.blob, {
      $type: "blob",
      ref: { $link: "fixture-cid" },
      mimeType: "image/png",
      size: sizeBytes,
    });
    assert.equal(uploads, 1);
    assert.equal(posts.mock.calls.length, 1);
    assert.equal(reads.mock.calls.length, 0);
    console.info(
      "[canonical-atproto] production cover projection and native POST acknowledged; source loan retired",
    );
  } finally {
    reads.mockRestore();
    posts.mockRestore();
    await peer.stop(true);
  }
}
