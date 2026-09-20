import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { App } from "@brains/app";
import { imageSchema } from "@brains/image";
import {
  parseAssetRef,
  createAssetRef,
  type AssetRecord,
} from "@brains/assets";
import { CallbackProgressReporter } from "@brains/utils/progress";

/** Real canonical handler, SDK actor, inspected upload and atomic publication.
 * Only the explicit test artifact's provider endpoint points to this fixture.
 */
export async function generateCanonicalAIImage(app: App): Promise<AssetRecord> {
  const bytes = Buffer.alloc(256 * 1024 + 7);
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ).copy(bytes);
  bytes[bytes.length - 1] = 42; // Distinct from the canonical cover asset.
  const digest = createHash("sha256").update(bytes).digest("hex");
  let requests = 0;
  let actorPid = 0;
  const peer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      requests++;
      actorPid = Number(request.headers.get("x-fixture-pid"));
      assert.equal(request.headers.get("authorization"), "Bearer fixture");
      assert.equal(new URL(request.url).pathname, "/images/generations");
      const body: unknown = await request.json();
      assert.ok(typeof body === "object" && body !== null && "model" in body);
      assert.equal(body.model, "gpt-image-1.5");
      return Response.json({
        created: 1,
        data: [{ b64_json: bytes.toString("base64") }],
      });
    },
  });
  try {
    const shell = app.getShell();
    shell.getAIService().updateConfig({
      imageModel: "gpt-image-1.5",
      imageApiKey: peer.url.href,
      apiKey: peer.url.href,
    });
    const handler = shell
      .getJobQueueService()
      .getHandler("image:image-generate");
    assert.ok(handler);
    const input = handler.validateAndParse({
      title: "Actor rendered image",
      prompt: "A single pixel",
      targetEntityType: "post",
      targetEntityId: "render-source",
    });
    assert.ok(input);
    const reporter = CallbackProgressReporter.from(
      async (): Promise<void> => undefined,
    );
    assert.ok(reporter);
    assert.deepEqual(
      await handler.process(
        input,
        "canonical-ai-image",
        reporter,
        new AbortController().signal,
      ),
      { success: true, imageId: "actor-rendered-image" },
    );
    assert.equal(requests, 1);
    assert.ok(actorPid > 0 && actorPid !== process.pid);
    assert.throws(() => process.kill(actorPid, 0), { code: "ESRCH" });
    const entities = shell.getEntityService();
    const image = imageSchema.parse(
      await entities.getEntity({
        entityType: "image",
        id: "actor-rendered-image",
      }),
    );
    assert.equal(image.metadata.attachmentType, "generated");
    assert.equal(image.metadata.width, 1);
    assert.equal(image.metadata.height, 1);
    const ref = parseAssetRef(image.content);
    assert.ok(ref);
    const record = await entities.statAsset(ref);
    assert.deepEqual(record, { ref, sizeBytes: bytes.length });
    assert.equal(ref, createAssetRef(digest));
    assert.ok(entities.fileAssets);
    await entities.fileAssets.withAssetFile(
      ref,
      async (file): Promise<void> => {
        assert.equal(file.sha256, digest);
        assert.deepEqual(await readFile(file.sourceFile), bytes);
      },
    );
    const target = await entities.getEntity({
      entityType: "post",
      id: "render-source",
    });
    assert.ok(target);
    assert.match(target.content, /coverImageId: actor-rendered-image/);
    assert.ok(record);
    return { ref, digest, sizeBytes: bytes.length };
  } finally {
    await peer.stop(true);
  }
}
