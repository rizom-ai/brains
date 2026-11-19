import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import {
  handleImageChange,
  queueUndescribedImages,
  type AltTextDeps,
} from "../src/lib/alt-text-listener";

const ready = {
  title: "Harbor",
  alt: "Harbor",
  format: "png",
  width: 1,
  height: 1,
  status: "draft",
};

function image(
  id: string,
  metadata: Record<string, unknown>,
  visibility: "public" | "restricted" = "public",
): BaseEntity {
  return {
    id,
    entityType: "image",
    content: "asset:sha256:abc",
    contentHash: "hash",
    created: "2026-11-18T00:00:00.000Z",
    updated: "2026-11-18T00:00:00.000Z",
    visibility,
    metadata,
  };
}

function deps(
  options: { canDescribe?: boolean; stored?: BaseEntity[] } = {},
): AltTextDeps & { queued: string[]; updated: BaseEntity[] } {
  const queued: string[] = [];
  const updated: BaseEntity[] = [];
  const stored = options.stored ?? [];
  return {
    queued,
    updated,
    canDescribe: () => options.canDescribe ?? true,
    readStored: async (id) => stored.find((entity) => entity.id === id) ?? null,
    listPublic: async () =>
      stored.filter((entity) => entity.visibility === "public"),
    update: async (entity): Promise<void> => {
      updated.push(entity);
    },
    enqueueDescribe: async (id): Promise<void> => {
      queued.push(id);
    },
  };
}

describe("an image change", () => {
  it("queues a description for a public image that became ready", async () => {
    const d = deps();
    await handleImageChange(d, {
      entityType: "image",
      entityId: "harbor",
      entity: image("harbor", ready),
      previousMetadata: { title: "Harbor", alt: "Harbor", status: "pending" },
    });

    expect(d.queued).toEqual(["harbor"]);
  });

  it("queues nothing when no model reads images, or for another type", async () => {
    const d = deps({ canDescribe: false });
    await handleImageChange(d, {
      entityType: "image",
      entityId: "harbor",
      entity: image("harbor", ready),
    });
    await handleImageChange(deps(), {
      entityType: "post",
      entityId: "harbor",
      entity: { ...image("harbor", ready), entityType: "post" },
    });

    expect(d.queued).toEqual([]);
  });

  it("marks rewritten alt text as the owner's, on the stored record", async () => {
    const edited = { ...ready, alt: "Our harbor", altSource: "generated" };
    const d = deps({ stored: [image("harbor", edited)] });
    await handleImageChange(d, {
      entityType: "image",
      entityId: "harbor",
      entity: image("harbor", edited),
      previousMetadata: {
        ...ready,
        alt: "Boats at dawn",
        altSource: "generated",
      },
    });

    expect(d.updated.map((entity) => entity.metadata)).toEqual([
      { ...edited, altSource: "owner" },
    ]);
    expect(d.queued).toEqual([]);
  });
});

describe("a change a service made", () => {
  it("is not taken for the owner's edit", async () => {
    const edited = { ...ready, alt: "Boats at dawn", altSource: "generated" };
    const d = deps({ stored: [image("harbor", edited)] });
    await handleImageChange(d, {
      entityType: "image",
      entityId: "harbor",
      entity: image("harbor", edited),
      previousMetadata: { ...edited, alt: "Boats at dawn, and" },
      actor: { kind: "service", serviceId: "image-alt-text" },
    });

    expect(d.updated).toEqual([]);
  });
});

describe("the start-up catch-up", () => {
  it("queues every public image whose alt text is still a stand-in", async () => {
    const d = deps({
      stored: [
        image("fallback", ready),
        image("described", { ...ready, altSource: "generated" }),
        image("owned", { ...ready, altSource: "owner" }),
        image("private", ready, "restricted"),
        image("drawing", { ...ready, format: "svg" }),
      ],
    });

    await queueUndescribedImages(d);

    expect(d.queued).toEqual(["fallback"]);
  });

  it("queues nothing when no model reads images", async () => {
    const d = deps({ canDescribe: false, stored: [image("fallback", ready)] });

    await queueUndescribedImages(d);

    expect(d.queued).toEqual([]);
  });
});

describe("the start-up catch-up, for alt text cut before this release", () => {
  it("trims generated alt text that ends on a word leaving it hanging", async () => {
    const d = deps({
      stored: [
        image("cut", {
          ...ready,
          alt: "A Bitcoin landscape amid coins, crowded industrial towns, and",
          altSource: "generated",
        }),
        image("whole", {
          ...ready,
          alt: "Fishing boats moored at dawn.",
          altSource: "generated",
        }),
        image("owned", { ...ready, alt: "Rock and", altSource: "owner" }),
      ],
    });

    await queueUndescribedImages(d);

    expect(
      d.updated.map((entity) => [entity.id, entity.metadata["alt"]]),
    ).toEqual([
      ["cut", "A Bitcoin landscape amid coins, crowded industrial towns"],
    ]);
    expect(d.queued).toEqual([]);
  });
});
