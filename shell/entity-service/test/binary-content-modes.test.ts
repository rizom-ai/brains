import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createAssetRef,
  type BinaryContentResolutionRequest,
  type BinaryContentResolver,
} from "@brains/assets";
import { createTestEntity } from "@brains/test-utils";
import type { EntityServiceTestContext } from "./helpers/setup-entity-service";
import { setupEntityService } from "./helpers/setup-entity-service";
import {
  imageAdapter,
  imageSchema,
  postAdapter,
  postSchema,
  type ImageEntity,
  type Post,
} from "./helpers/test-schemas";

const ASSET_REF = createAssetRef("a".repeat(64));
const DATA_URL = "data:image/png;base64,cG5nLWJ5dGVz";

describe("binary content read modes", () => {
  let ctx: EntityServiceTestContext;
  const materializeLegacyDataUrl = mock(
    async (_request: BinaryContentResolutionRequest): Promise<string> =>
      DATA_URL,
  );
  const binaryContentResolver: BinaryContentResolver = {
    materializeLegacyDataUrl,
  };

  beforeEach(async () => {
    materializeLegacyDataUrl.mockClear();
    ctx = await setupEntityService(
      [
        {
          name: "image",
          schema: imageSchema,
          adapter: imageAdapter,
          config: {
            embeddable: false,
            fullTextSearchable: false,
            binaryStorage: "asset",
          },
        },
        { name: "post", schema: postSchema, adapter: postAdapter },
      ],
      { binaryContentResolver },
    );
    await ctx.entityService.initialize();
    await ctx.entityService.createEntity<ImageEntity>({
      entity: createTestEntity<ImageEntity>("image", {
        id: "hero",
        content: ASSET_REF,
        metadata: { mediaType: "image/png" },
      }),
    });
  });

  afterEach(async () => {
    ctx.entityService.close();
    await ctx.cleanup();
  });

  test("preserves opaque asset content for non-public entities", async () => {
    await ctx.entityService.createEntity<ImageEntity>({
      entity: createTestEntity<ImageEntity>("image", {
        id: "restricted-hero",
        content: ASSET_REF,
        visibility: "restricted",
        metadata: { mediaType: "image/png" },
      }),
    });

    const entity = await ctx.entityService.getEntity<ImageEntity>({
      entityType: "image",
      id: "restricted-hero",
      visibilityScope: "restricted",
      binaryContent: "reference",
    });

    expect(entity?.content).toBe(ASSET_REF);
    expect(entity?.visibility).toBe("restricted");
    expect(materializeLegacyDataUrl).not.toHaveBeenCalled();
  });

  test("get/raw/list return references without materializing bytes in reference mode", async () => {
    const [resolved, raw, listed] = await Promise.all([
      ctx.entityService.getEntity<ImageEntity>({
        entityType: "image",
        id: "hero",
        binaryContent: "reference",
        binaryContentSurface: "mode-matrix-get",
      }),
      ctx.entityService.getEntityRaw<ImageEntity>({
        entityType: "image",
        id: "hero",
        binaryContent: "reference",
        binaryContentSurface: "mode-matrix-raw",
      }),
      ctx.entityService.listEntities<ImageEntity>({
        entityType: "image",
        binaryContent: "reference",
        binaryContentSurface: "mode-matrix-list",
      }),
    ]);

    expect(resolved?.content).toBe(ASSET_REF);
    expect(raw?.content).toBe(ASSET_REF);
    expect(listed.map((entity) => entity.content)).toEqual([ASSET_REF]);
    expect(materializeLegacyDataUrl).not.toHaveBeenCalled();
  });

  test("omitted mode preserves get/raw/list data-URL behavior with method telemetry", async () => {
    const resolved = await ctx.entityService.getEntity<ImageEntity>({
      entityType: "image",
      id: "hero",
      binaryContentSurface: "mode-matrix-get",
    });
    const raw = await ctx.entityService.getEntityRaw<ImageEntity>({
      entityType: "image",
      id: "hero",
      binaryContentSurface: "mode-matrix-raw",
    });
    const listed = await ctx.entityService.listEntities<ImageEntity>({
      entityType: "image",
      binaryContentSurface: "mode-matrix-list",
    });

    expect(resolved?.content).toBe(DATA_URL);
    expect(raw?.content).toBe(DATA_URL);
    expect(listed.map((entity) => entity.content)).toEqual([DATA_URL]);
    expect(materializeLegacyDataUrl).toHaveBeenNthCalledWith(1, {
      ref: ASSET_REF,
      mediaType: "image/png",
      method: "getEntity",
      surface: "mode-matrix-get",
    });
    expect(materializeLegacyDataUrl).toHaveBeenNthCalledWith(2, {
      ref: ASSET_REF,
      mediaType: "image/png",
      method: "getEntityRaw",
      surface: "mode-matrix-raw",
    });
    expect(materializeLegacyDataUrl).toHaveBeenNthCalledWith(3, {
      ref: ASSET_REF,
      mediaType: "image/png",
      method: "listEntities",
      surface: "mode-matrix-list",
    });
  });

  test("reference mode leaves embedded entity image references untouched", async () => {
    const post = createTestEntity<Post>("post", {
      id: "with-image",
      content: "![Hero](entity://image/hero)",
      metadata: {},
    });
    await ctx.entityService.createEntity<Post>({ entity: post });

    const reference = await ctx.entityService.getEntity<Post>({
      entityType: "post",
      id: "with-image",
      binaryContent: "reference",
    });
    expect(reference?.content).toBe("![Hero](entity://image/hero)");
    expect(materializeLegacyDataUrl).not.toHaveBeenCalled();

    const compatible = await ctx.entityService.getEntity<Post>({
      entityType: "post",
      id: "with-image",
    });
    expect(compatible?.content).toBe(`![Hero](${DATA_URL})`);
  });
});
