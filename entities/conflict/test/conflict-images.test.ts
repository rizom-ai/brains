import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecordConflictRequest } from "@brains/contracts";
import { assetRefSchema } from "@brains/sdk/internal/service-runtime";
import type { BaseEntity } from "@brains/plugins";
import { doc, openBrain, seed, type Brain } from "./helpers/store";
import { rejection } from "./helpers/rejection";

const admin = { permissionLevel: "admin" as const };
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("a losing image", () => {
  let dir: string;
  let brain: Brain;
  let target: BaseEntity;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "test-conflict-images-"));
    brain = await openBrain(dir);
    target = await seedImage(brain, "cover", bytes("the current image"));
  });

  afterEach(() => {
    brain.service.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const lost = (
    image: Uint8Array = bytes("the losing image"),
  ): RecordConflictRequest => ({
    entityType: "image",
    entityId: "cover",
    origin: "drive",
    actor: "usr_editor",
    current: target.contentHash,
    text: "",
    image: { bytes: image, metadata: { format: "png", width: 2, height: 3 } },
    targetVisibility: "public",
  });

  const held = (): Promise<BaseEntity[]> =>
    brain.service.listEntities({
      entityType: "conflict-image",
      options: { filter: { visibilityScope: "restricted" } },
    });
  const read = async (content: string): Promise<string> =>
    new TextDecoder().decode(
      await brain.service.readAsset(assetRefSchema.parse(content)),
    );
  const current = async (): Promise<BaseEntity> => {
    const entity = await brain.service.getEntity({
      entityType: "image",
      id: "cover",
      visibilityScope: "restricted",
      source: true,
    });
    if (!entity) throw new Error("No image");
    return entity;
  };

  it("is kept as its bytes, never public, with what it is about", async () => {
    const response = await brain.store.record(lost());

    expect(response.created).toBe(true);
    const [conflict] = await held();
    if (!conflict) throw new Error("No conflict held");
    expect(conflict.id).toBe(response.conflictId);
    expect(conflict.visibility).toBe("shared");
    expect(await read(conflict.content)).toBe("the losing image");
    expect(conflict.metadata).toMatchObject({
      targetType: "image",
      targetId: "cover",
      origin: "drive",
      actor: "usr_editor",
      current: target.contentHash,
      image: { format: "png", width: 2, height: 3, sizeBytes: 16 },
    });
    // The image the brain kept is untouched.
    expect(await read((await current()).content)).toBe("the current image");
  });

  it("is one conflict however often the same bytes lose", async () => {
    const first = await brain.store.record(lost());
    const again = await brain.store.record(lost());

    expect(again).toEqual({ conflictId: first.conflictId, created: false });
    expect(await held()).toHaveLength(1);
    await brain.store.record(lost(bytes("another losing image")));
    expect(await held()).toHaveLength(2);
  });

  it("is listed with text conflicts, oldest first", async () => {
    await seed(brain, "post", "first", doc("First"));
    await brain.store.record(lost());
    brain.clock.now = new Date("2026-11-18T10:21:00.000Z");
    await brain.store.record({
      entityType: "post",
      entityId: "first",
      origin: "file",
      current: "hash",
      text: doc("Edited"),
      targetVisibility: "public",
    });

    expect(
      (await brain.store.list()).map((item) => [item.kind, item.targetType]),
    ).toEqual([
      ["image", "image"],
      ["text", "post"],
    ]);
  });

  it("names both images in its detail", async () => {
    await brain.store.record(lost());
    const [item] = await brain.store.list();
    if (!item) throw new Error("No item");

    const detail = await brain.store.detail(item.itemId, admin);

    expect(detail).toContain("Current image: png, 17 bytes");
    expect(detail).toContain("This version: png, 2 × 3, 16 bytes");
  });

  it("replaces the current image when applied, and is gone", async () => {
    await brain.store.record(lost());
    const [item] = await brain.store.list();
    if (!item) throw new Error("No item");

    await brain.store.apply(item.itemId, admin);

    const now = await current();
    expect(await read(now.content)).toBe("the losing image");
    expect(now.metadata).toMatchObject({ format: "png", width: 2, height: 3 });
    expect(now.metadata["sizeBytes"]).toBe(16);
    expect(await held()).toEqual([]);
  });

  it("is kept when the image changed while it was being applied", async () => {
    await brain.store.record(lost());
    const [item] = await brain.store.list();
    if (!item) throw new Error("No item");
    const update = brain.service.updateEntity.bind(brain.service);
    let raced = false;
    brain.service.updateEntity = async (request): ReturnType<typeof update> => {
      if (!raced) {
        raced = true;
        await replaceImage(brain, "cover", bytes("a third image"));
      }
      return update(request);
    };

    expect(await rejection(brain.store.apply(item.itemId, admin))).toContain(
      "changed while this version was being applied",
    );
    expect(await read((await current()).content)).toBe("a third image");
    expect(await held()).toHaveLength(1);
  });

  it("is removed when the current image is kept", async () => {
    await brain.store.record(lost());
    const [item] = await brain.store.list();
    if (!item) throw new Error("No item");

    await brain.store.dismiss(item.itemId);

    expect(await held()).toEqual([]);
    expect(await read((await current()).content)).toBe("the current image");
  });

  it("is not applied by a person who may not change images", async () => {
    await brain.store.record(lost());
    const [item] = await brain.store.list();
    if (!item) throw new Error("No item");
    brain.locked.add("image");

    expect(await rejection(brain.store.apply(item.itemId, admin))).toContain(
      "not allowed",
    );
    expect(await read((await current()).content)).toBe("the current image");
    expect(await held()).toHaveLength(1);
  });
});

async function seedImage(
  brain: Brain,
  id: string,
  image: Uint8Array,
): Promise<BaseEntity> {
  const stagedAsset = await brain.service.stageAsset(image);
  await brain.service.createEntity({
    entity: {
      id,
      entityType: "image",
      content: stagedAsset.ref,
      metadata: { format: "png", sizeBytes: image.byteLength },
    },
    stagedAsset,
  });
  const stored = await brain.service.getEntity({
    entityType: "image",
    id,
    visibilityScope: "restricted",
    source: true,
  });
  if (!stored) throw new Error("Seed failed");
  return stored;
}

async function replaceImage(
  brain: Brain,
  id: string,
  image: Uint8Array,
): Promise<void> {
  const stored = await brain.service.getEntity({
    entityType: "image",
    id,
    visibilityScope: "restricted",
    source: true,
  });
  if (!stored) throw new Error("No image to replace");
  const stagedAsset = await brain.service.stageAsset(image);
  await brain.service.updateEntity({
    entity: { ...stored, content: stagedAsset.ref },
    stagedAsset,
  });
}
