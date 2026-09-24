import { expect, it } from "bun:test";
import assert from "node:assert/strict";
import { getAssetDigest } from "@brains/assets";
import type {
  AtprotoProjectionContext,
  AtprotoPdsClientLike,
} from "@brains/atproto-contracts";
import type { BaseEntity, GetEntityRequest } from "@brains/plugins";
import {
  prepareAtprotoBodyImages,
  AcknowledgedAtprotoPostImagesError,
} from "../src/atproto-body-images";
import { buildBlogAtprotoPostRecord } from "../src/atproto-projection";
import { createMockPost } from "./fixtures/blog-entities";

function fixture(mode = "success"): {
  context: AtprotoProjectionContext;
  client: AtprotoPdsClientLike;
  uploads: string[];
  active: () => number;
} {
  const ref = `asset://sha256/${"a".repeat(64)}` as const;
  const abort = new AbortController();
  let active = 0;
  const uploads: string[] = [];
  const unsupported = async (): Promise<never> => {
    throw new Error("Unexpected operation");
  };
  const context: AtprotoProjectionContext = {
    entityService: {
      getEntity: async ({
        id,
      }: GetEntityRequest): Promise<BaseEntity | null> =>
        id === "missing"
          ? null
          : {
              id,
              entityType: "image",
              content: ref,
              contentHash: "hash",
              created: "2026-01-01T00:00:00Z",
              updated: "2026-01-01T00:00:00Z",
              visibility: id === "private" ? "restricted" : "public",
              metadata: {
                format: "png",
                mediaType: "image/png",
                sizeBytes: 70,
                width: 1,
                height: 1,
                status: "draft",
              },
            },
      statAsset: async () => ({ ref, sizeBytes: 70 }),
      updateEntity: unsupported,
      fileAssets: {
        withAssetFile: async (_ref, use) => {
          active++;
          try {
            const result = await use(
              {
                sourceFile: "/fixture/image.png",
                sizeBytes: 70,
                sha256: "a".repeat(64),
              },
              abort.signal,
            );
            if (mode === "retirement") throw new Error("retirement failed");
            return result;
          } finally {
            active--;
          }
        },
        inspect: async () => ({
          sizeBytes: 70,
          sha256: "a".repeat(64),
          details: {
            mediaType: "image/png",
            width: 1,
            height: 1,
            format: "png",
          },
        }),
        putHttp: unsupported,
        postHttp: unsupported,
        publish: unsupported,
        fingerprint: unsupported,
        download: unsupported,
        close: async () => {},
      },
    },
  };
  const client: AtprotoPdsClientLike = {
    createSession: unsupported,
    createRecord: unsupported,
    uploadBlob: async (file) => {
      expect(active).toBe(1);
      expect(file.sourceFile).toBe("/fixture/image.png");
      if (mode === "second-failure" && uploads.length)
        throw new Error("second upload unknown");
      uploads.push(file.sha256);
      if (mode === "cancelled") abort.abort(new Error("cancelled"));
      return {
        blob: {
          $type: "blob",
          ref: { $link: `cid-${uploads.length}` },
          mimeType: "image/png",
          size: 70,
        },
      };
    },
    getBlobUrl: async (blob) => {
      expect(active).toBe(1);
      if (mode === "url-failure") throw new Error("URL failed");
      return `https://pds.example/blob/${blob.ref.$link}`;
    },
  };
  return { context, client, uploads, active: () => active };
}

it("publishes body URLs and retained blobs through the production post projection", async () => {
  const f = fixture();
  const post = createMockPost("p", "Post", "post", "published");
  post.content +=
    '\n\n![one](entity://image/a)\n\n![two][pic]\n\n[pic]: entity://image/a "Caption"\n';
  const result = await buildBlogAtprotoPostRecord({
    entity: post,
    config: {},
    ...f,
  });
  expect(result.body).toContain("![one](https://pds.example/blob/cid-1)");
  expect(result.body).toContain(
    '![two](https://pds.example/blob/cid-1 "Caption")',
  );
  expect(result.images).toEqual([
    {
      url: "https://pds.example/blob/cid-1",
      blob: {
        $type: "blob",
        ref: { $link: "cid-1" },
        mimeType: "image/png",
        size: 70,
      },
    },
  ]);
  expect(f.uploads).toHaveLength(1);
  expect(f.active()).toBe(0);
});

it.each(["same", "changed"])(
  "reuses a body receipt for the cover only when source facts still match: %s",
  async (mode) => {
    const f = fixture();
    if (mode === "changed") {
      const files = f.context.entityService.fileAssets;
      assert.ok(files);
      const get = f.context.entityService.getEntity;
      let reads = 0;
      f.context.entityService.getEntity = async (
        request: GetEntityRequest,
      ): Promise<BaseEntity | null> => {
        const entity = await get(request);
        if (!entity) return null;
        return reads++ === 0
          ? entity
          : { ...entity, content: `asset://sha256/${"b".repeat(64)}` };
      };
      f.context.entityService.statAsset = async (
        ref,
      ): ReturnType<typeof f.context.entityService.statAsset> => ({
        ref,
        sizeBytes: 70,
      });
      let digest = "a".repeat(64);
      const borrow = files.withAssetFile.bind(files);
      files.withAssetFile = async (
        ref,
        use,
        options,
      ): ReturnType<typeof use> => {
        digest = getAssetDigest(ref);
        return borrow(
          ref,
          (file, signal) => use({ ...file, sha256: digest }, signal),
          options,
        );
      };
      const inspect = files.inspect.bind(files);
      files.inspect = async (input, options): ReturnType<typeof inspect> => ({
        ...(await inspect(input, options)),
        sha256: digest,
      });
    }
    const post = createMockPost("p", "Post", "post", "published");
    post.content =
      post.content.replace("---\n", "---\ncoverImageId: a\n") +
      "\n\n![a](entity://image/a)";
    const result = await buildBlogAtprotoPostRecord({
      entity: post,
      config: {},
      ...f,
    });
    expect(f.uploads).toEqual(
      mode === "same" ? ["a".repeat(64)] : ["a".repeat(64), "b".repeat(64)],
    );
    expect(result.coverImage?.blob.ref.$link).toBe(
      mode === "same" ? "cid-1" : "cid-2",
    );
    expect(f.active()).toBe(0);
  },
);

it.each(["missing", "private"])(
  "authorizes the whole body before uploading: %s",
  async (id) => {
    const f = fixture();
    await assert.rejects(
      prepareAtprotoBodyImages(
        `![ok](entity://image/a) ![bad](entity://image/${id})`,
        f,
      ),
    );
    expect(f.uploads).toHaveLength(0);
    expect(f.active()).toBe(0);
  },
);

it.each(["retirement", "cancelled", "url-failure", "second-failure"])(
  "retains acknowledged prefixes and withholds the post: %s",
  async (mode) => {
    const f = fixture(mode);
    await assert.rejects(
      prepareAtprotoBodyImages(
        "![a](entity://image/a) ![b](entity://image/b)",
        f,
      ),
      (error: unknown) => {
        expect(error).toBeInstanceOf(AcknowledgedAtprotoPostImagesError);
        if (!(error instanceof AcknowledgedAtprotoPostImagesError))
          return false;
        expect(error.receipts[0]?.blob.ref.$link).toBe("cid-1");
        expect(error.cause).toBeInstanceOf(Error);
        return true;
      },
    );
    expect(f.uploads).toHaveLength(1);
    expect(f.active()).toBe(0);
  },
);

it("preserves body acknowledgements if the subsequent cover preparation fails", async () => {
  const f = fixture();
  const get = f.context.entityService.getEntity;
  const failure = new Error("Cover unavailable");
  f.context.entityService.getEntity = async (
    request: GetEntityRequest,
  ): Promise<BaseEntity | null> => {
    if (request.id === "cover") throw failure;
    return get(request);
  };
  const post = createMockPost("p", "Post", "post", "published");
  post.content =
    post.content.replace("---\n", "---\ncoverImageId: cover\n") +
    "\n\n![a](entity://image/a)";
  await assert.rejects(
    buildBlogAtprotoPostRecord({ entity: post, config: {}, ...f }),
    (error: unknown) => {
      if (!(error instanceof AcknowledgedAtprotoPostImagesError)) return false;
      expect(error.cause).toBe(failure);
      expect(error.receipts[0]?.url).toBe("https://pds.example/blob/cid-1");
      return true;
    },
  );
  expect(f.uploads).toHaveLength(1);
});

it("dry-run inspects without a PDS client or upload", async () => {
  const f = fixture();
  const result = await prepareAtprotoBodyImages("![a](entity://image/a)", {
    context: f.context,
    dryRun: true,
  });
  expect(result.images[0]?.blob.size).toBe(70);
  expect(result.receipts).toHaveLength(0);
  expect(f.uploads).toHaveLength(0);
});

it("retains receipts when rewritten output exceeds the record body limit", async () => {
  const f = fixture();
  const image = "\n\n![a](entity://image/a)";
  const body = "x".repeat(100_000 - image.length) + image;
  await assert.rejects(
    prepareAtprotoBodyImages(body, f),
    AcknowledgedAtprotoPostImagesError,
  );
  expect(f.uploads).toHaveLength(1);
  expect(f.active()).toBe(0);
});

it("rejects credential-bearing download URLs without losing the uploaded receipt", async () => {
  const f = fixture();
  f.client.getBlobUrl = async (): Promise<string> =>
    "https://user:secret@pds.example/blob";
  await assert.rejects(
    prepareAtprotoBodyImages("![a](entity://image/a)", f),
    AcknowledgedAtprotoPostImagesError,
  );
  expect(f.uploads).toHaveLength(1);
});

it("rejects inline payloads, missing capabilities and bounded-set overflow before uploading", async () => {
  const f = fixture();
  for (const body of [
    "![a](data:image/png;base64,AAAA)",
    "![a](DATA:image/png;base64,AAAA)",
    "x".repeat(100_001),
    Array.from({ length: 9 }, (_, i) => `![a](entity://image/${i})`).join(" "),
    "![a](entity://image/a) ".repeat(33),
  ]) {
    await assert.rejects(prepareAtprotoBodyImages(body, f));
  }
  await assert.rejects(
    prepareAtprotoBodyImages("![a](entity://image/a)", { context: f.context }),
  );
  expect(f.uploads).toHaveLength(0);
});
