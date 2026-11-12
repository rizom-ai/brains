import { describe, expect, it } from "bun:test";
import type {
  AtprotoLexicon,
  AtprotoPdsClientLike,
  AtprotoProjection,
  AtprotoProjectionContext,
} from "@brains/atproto-contracts";
import type { BaseEntity } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type EntityAtprotoRecordInput,
  type EntityOf,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

const clipLexicon: AtprotoLexicon = {
  lexicon: 1,
  id: "example.reader.clip",
  defs: {
    main: {
      type: "record",
      key: "any",
      record: {
        type: "object",
        required: ["title"],
        properties: { title: { type: "string" } },
      },
    },
  },
};

const cover = defineEntity({
  type: "cover",
  purpose: "An image a clip shows.",
  metadata: z.object({ alt: z.string() }),
});

function clipDefinition(seen: {
  input?: EntityAtprotoRecordInput<EntityOf<AnyEntityDefinition>>;
}): AnyEntityDefinition {
  return defineEntity({
    type: "clip",
    purpose: "A clipped passage, published as a record.",
    metadata: z.object({
      title: z.string(),
      status: z.enum(["draft", "published"]).default("draft"),
      coverId: z.string().optional(),
    }),
    atproto: {
      lexicon: clipLexicon,
      validate: false,
      isPublishable: (clip) => clip.metadata.status === "published",
      buildRecord: async (input) => {
        seen.input = input;
        const coverId = input.entity.metadata.coverId;
        const image = coverId ? await input.entities.get(cover, coverId) : null;
        const blob = image
          ? await input.uploadBlob({
              data: new TextEncoder().encode(image.content),
              mimeType: "image/png",
            })
          : undefined;
        return {
          $type: clipLexicon.id,
          title: input.entity.metadata.title,
          ...(blob && { cover: blob, coverVisibility: image?.visibility }),
        };
      },
    },
  });
}

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<Harness> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "clips", entities }),
    {},
    { name: "@fixture/clips", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-atproto"),
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness;
}

function registered(harness: Harness): AtprotoProjection {
  const projection = harness
    .getMockShell()
    .getAtprotoProjectionRegistry()
    .get("clip");
  if (!projection) throw new Error("No projection registered for clip");
  return projection;
}

async function rawClip(
  harness: Harness,
  metadata: Record<string, unknown>,
): Promise<BaseEntity> {
  await harness.getEntityService().createEntity({
    entity: { id: "tide", entityType: "clip", content: "", metadata },
  });
  const entity = await harness.getEntityService().getEntity({
    entityType: "clip",
    id: "tide",
    visibilityScope: "restricted",
  });
  if (!entity) throw new Error("The clip was not stored");
  return entity;
}

// The caller's context: a projection must not read through it.
const callerContext: AtprotoProjectionContext = {
  entityService: {
    getEntity: async () => {
      throw new Error("read through the caller's context");
    },
    updateEntity: async () => {
      throw new Error("wrote through the caller's context");
    },
  },
};

describe("declared AT Protocol projection", () => {
  it("registers under the type, collected from its lexicon", async () => {
    const harness = await install([cover, clipDefinition({})]);
    try {
      const projection = registered(harness);
      expect(projection.entityType).toBe("clip");
      expect(projection.collection).toBe("example.reader.clip");
      expect(projection.lexicon).toEqual(clipLexicon);
      expect(projection.validate).toBe(false);
    } finally {
      await harness.reset();
    }
  });

  it("builds the record from the definition-typed entity", async () => {
    const seen: Parameters<typeof clipDefinition>[0] = {};
    const harness = await install([cover, clipDefinition(seen)]);
    try {
      const entity = await rawClip(harness, { title: "Tides" });
      const record = await registered(harness).buildRecord({
        entity,
        context: callerContext,
        config: { brainDid: "did:plc:brain" },
        pageUrl: "https://reader.example/clips/tide",
        topics: ["sea"],
        dryRun: true,
      });

      expect(record).toEqual({ $type: "example.reader.clip", title: "Tides" });
      expect(seen.input?.entity.metadata).toEqual({
        title: "Tides",
        status: "draft",
      });
      expect(seen.input?.config).toEqual({ brainDid: "did:plc:brain" });
      expect(seen.input?.pageUrl).toBe("https://reader.example/clips/tide");
      expect(seen.input?.topics).toEqual(["sea"]);
      expect(seen.input?.dryRun).toBe(true);
      expect(Object.isFrozen(seen.input)).toBe(true);
    } finally {
      await harness.reset();
    }
  });

  it("reads public entries only, not through the caller's context", async () => {
    const harness = await install([cover, clipDefinition({})]);
    try {
      const covers: { id: string; visibility: BaseEntity["visibility"] }[] = [
        { id: "gull", visibility: "restricted" },
        { id: "tern", visibility: "shared" },
        { id: "heron", visibility: "public" },
      ];
      for (const { id, visibility } of covers) {
        await harness.getEntityService().createEntity({
          entity: {
            id,
            entityType: "cover",
            content: "png-bytes",
            metadata: { alt: `A ${id}` },
            visibility,
          },
        });
      }
      const recordWith = async (
        coverId: string,
      ): Promise<Record<string, unknown>> => {
        const entity = await rawClip(harness, { title: "Tides", coverId });
        await harness
          .getEntityService()
          .deleteEntity({ entityType: "clip", id: "tide" });
        return registered(harness).buildRecord({
          entity,
          context: callerContext,
          config: {},
          dryRun: true,
        });
      };

      // The record goes to a public PDS, so it is built from public entries.
      expect(await recordWith("gull")).toEqual({
        $type: clipLexicon.id,
        title: "Tides",
      });
      expect(await recordWith("tern")).toEqual({
        $type: clipLexicon.id,
        title: "Tides",
      });
      expect((await recordWith("heron"))["coverVisibility"]).toBe("public");
    } finally {
      await harness.reset();
    }
  });

  it("uploads blobs through the PDS client, or names a placeholder in a dry run", async () => {
    const harness = await install([cover, clipDefinition({})]);
    try {
      await harness.getEntityService().createEntity({
        entity: {
          id: "gull",
          entityType: "cover",
          content: "png-bytes",
          metadata: { alt: "A gull" },
        },
      });
      const entity = await rawClip(harness, {
        title: "Tides",
        coverId: "gull",
      });
      const uploaded: { data: Uint8Array; mimeType: string }[] = [];
      const client: AtprotoPdsClientLike = {
        createSession: async () => ({
          did: "did:plc:brain",
          handle: "brain.example",
          accessJwt: "a",
          refreshJwt: "r",
        }),
        createRecord: async () => ({ uri: "at://x", cid: "c" }),
        uploadBlob: async (input) => {
          uploaded.push(input);
          return {
            blob: {
              $type: "blob",
              ref: { $link: "bafy" },
              mimeType: input.mimeType,
              size: input.data.byteLength,
            },
          };
        },
      };
      const projection = registered(harness);
      const stored = await harness
        .getEntityService()
        .getEntity({ entityType: "cover", id: "gull" });
      const bytes = new TextEncoder().encode(stored?.content);

      const published = await projection.buildRecord({
        entity,
        context: callerContext,
        config: {},
        client,
      });
      expect(published["cover"]).toEqual({
        $type: "blob",
        ref: { $link: "bafy" },
        mimeType: "image/png",
        size: bytes.byteLength,
      });
      expect(uploaded[0]?.data).toEqual(bytes);

      const previewed = await projection.buildRecord({
        entity,
        context: callerContext,
        config: {},
        dryRun: true,
      });
      expect(previewed["cover"]).toEqual({
        $type: "blob",
        ref: { $link: "dry-run" },
        mimeType: "image/png",
        size: bytes.byteLength,
      });
      expect(uploaded).toHaveLength(1);

      const { uploadBlob: _dropped, ...withoutBlobs } = client;
      const refused = await projection
        .buildRecord({
          entity,
          context: callerContext,
          config: {},
          client: withoutBlobs,
        })
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);
      expect(String(refused)).toContain("does not support blob uploads");
    } finally {
      await harness.reset();
    }
  });

  it("decides publishability on the validated record", async () => {
    const harness = await install([cover, clipDefinition({})]);
    try {
      const projection = registered(harness);
      const published = await rawClip(harness, {
        title: "Tides",
        status: "published",
      });
      expect(projection.isPublishable?.(published)).toBe(true);
      expect(
        projection.isPublishable?.({
          ...published,
          metadata: { title: "Tides" },
        }),
      ).toBe(false);

      // An invalid record is not withdrawn as unpublishable: its build fails,
      // and the failure is reported.
      const invalid = { ...published, metadata: { status: "published" } };
      expect(projection.isPublishable?.(invalid)).toBe(true);
      expect(
        await projection
          .buildRecord({
            entity: invalid,
            context: callerContext,
            config: {},
            dryRun: true,
          })
          .catch((error: unknown) => error),
      ).toBeInstanceOf(Error);
    } finally {
      await harness.reset();
    }
  });

  it("releases its projection on shutdown", async () => {
    const harness = await install([cover, clipDefinition({})]);
    const registry = harness.getMockShell().getAtprotoProjectionRegistry();
    expect(registry.has("clip")).toBe(true);
    await harness.reset();
    expect(registry.has("clip")).toBe(false);
  });
});
