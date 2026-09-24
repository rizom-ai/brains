import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spyOn } from "bun:test";
import type { App } from "@brains/app";
import type { BaseEntity } from "@brains/plugins";
import { createBlogAtprotoProjection } from "@brains/blog";
import { AtprotoPdsClient } from "@brains/atproto";
import { extractCoverImageId, extractMarkdownImages } from "@brains/image";

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
  let uploadedBytes: ArrayBuffer | undefined;
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
      if (new URL(request.url).pathname.endsWith("getBlob")) {
        assert.ok(uploadedBytes);
        assert.equal(request.headers.get("authorization"), null);
        assert.equal(
          new URL(request.url).searchParams.get("did"),
          "did:plc:fixture",
        );
        assert.equal(
          new URL(request.url).searchParams.get("cid"),
          "fixture-cid",
        );
        return new Response(uploadedBytes, {
          headers: { "content-type": "image/png" },
        });
      }
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
      uploadedBytes = bytes;
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
    const imageId = extractCoverImageId(entity);
    assert.ok(imageId);
    const result = await createBlogAtprotoProjection().buildRecord({
      entity: {
        ...entity,
        content: `${entity.content}\n\n![Body image](entity://image/${imageId})`,
      },
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
    assert.equal(result.images?.length, 1);
    const image = result.images[0];
    assert.ok(image);
    assert.deepEqual(image.blob, result.coverImage.blob);
    assert.ok(
      extractMarkdownImages(result.body).some(
        (entry) => entry.url === image.url,
      ),
    );
    // Remote-reader verification, not a production controller download path.
    const response = await fetch(image.url);
    assert.equal(response.status, 200);
    assert.equal(
      createHash("sha256")
        .update(new Uint8Array(await response.arrayBuffer()))
        .digest("hex"),
      digest,
    );
    assert.equal(uploads, 1);
    assert.equal(posts.mock.calls.length, 1);
    assert.equal(reads.mock.calls.length, 0);
    console.info(
      "[canonical-atproto] production body/cover native uploads acknowledged; public body URL verified and source loans retired",
    );
  } finally {
    reads.mockRestore();
    posts.mockRestore();
    await peer.stop(true);
  }
}
