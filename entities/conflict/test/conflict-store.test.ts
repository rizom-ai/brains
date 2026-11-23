import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createTestDirectory } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { conflictId, conflictStamp } from "../src/lib/conflict-id";
import { conflictVisibility } from "../src/lib/conflict-visibility";
import { decodeLosingText, encodeLosingText } from "../src/lib/losing-text";
import { doc, openBrain, seed, type Brain } from "./helpers/store";
import { rejection } from "./helpers/rejection";

const admin = { permissionLevel: "admin" } as const;

describe("conflict ids and visibility", () => {
  it("stamps a conflict with the UTC second, and no colon", () => {
    expect(conflictStamp(new Date("2026-11-18T10:20:30.789Z"))).toBe(
      "20261118T102030Z",
    );
  });

  it("names a conflict after its target and its stamp", () => {
    expect(conflictId("post", "first", "20261118T102030Z")).toBe(
      "post:first:20261118T102030Z",
    );
    expect(conflictId("site-content", "home:hero", "20261118T102030Z-2")).toBe(
      "site-content:home:hero:20261118T102030Z-2",
    );
  });

  it("takes the stricter of the target's and the losing text's visibility, never public", () => {
    expect(conflictVisibility("public", undefined)).toBe("shared");
    expect(conflictVisibility("public", "public")).toBe("shared");
    expect(conflictVisibility("shared", "public")).toBe("shared");
    expect(conflictVisibility("public", "restricted")).toBe("restricted");
    expect(conflictVisibility("restricted", "shared")).toBe("restricted");
  });
});

describe("a losing text as a conflict's body", () => {
  it("round-trips any file, including one full of fences and one that is empty", () => {
    for (const text of [
      "",
      "plain",
      "ends with a newline\n",
      "---\ntitle: X\n---\n\nBody\n",
      "a fence:\n```ts\ncode\n```\nand a longer one `````\n",
      "\r\nCRLF\r\n",
    ]) {
      expect(decodeLosingText(encodeLosingText(text))).toBe(text);
    }
  });

  it("refuses a body that is not one", () => {
    expect(() => decodeLosingText("just text")).toThrow();
  });
});

describe("the conflict store", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let brain: Brain;
  beforeEach(async () => {
    directory = await createTestDirectory("conflict-store");
    brain = await openBrain(directory.dir);
  });
  afterEach(async () => {
    brain.service.close();
    await directory.cleanup();
  });

  const losing = doc("First, from the file");

  async function record(
    overrides: Partial<Parameters<Brain["store"]["record"]>[0]> = {},
  ): ReturnType<Brain["store"]["record"]> {
    const target = await brain.service.getEntity({
      entityType: overrides.entityType ?? "post",
      id: overrides.entityId ?? "first",
      visibilityScope: "restricted",
      source: true,
    });
    return brain.store.record({
      entityType: "post",
      entityId: "first",
      origin: "file",
      base: "hash-of-the-base",
      current: target?.contentHash ?? "missing",
      text: losing,
      targetVisibility: target?.visibility ?? "public",
      ...overrides,
    });
  }

  it("keeps a losing edit as a conflict that names its target, where it came from and what it clashed with", async () => {
    const target = await seed(brain, "post", "first", doc("First"));

    const recorded = await record({ actor: "usr_mira", origin: "drive" });

    expect(recorded).toEqual({
      conflictId: "post:first:20261118T102030Z",
      created: true,
    });
    const conflict = await brain.service.getEntity({
      entityType: "conflict",
      id: recorded.conflictId,
      visibilityScope: "restricted",
    });
    expect(conflict?.metadata).toEqual({
      targetType: "post",
      targetId: "first",
      origin: "drive",
      actor: "usr_mira",
      base: "hash-of-the-base",
      current: target.contentHash,
      edit: computeContentHash(losing),
    });
    expect(conflict?.created).toBe("2026-11-18T10:20:30.000Z");
    expect(conflict?.visibility).toBe("shared");
    // The body is the losing file, frontmatter and all, exactly as it arrived.
    expect(decodeLosingText(conflict?.content ?? "")).toBe(losing);
  });

  it("stores the losing file byte for byte, whatever its shape", async () => {
    await seed(brain, "post", "first", doc("First"));
    for (const text of [
      "no frontmatter and no final newline",
      "---\ntitle: [unclosed\n---\nbroken yaml\n",
      "\n\n  leading blank lines\r\nand CRLF\r\n\n\n",
      "",
    ]) {
      brain.clock.now = new Date(brain.clock.now.getTime() + 1000);
      const { conflictId: id } = await record({ text });
      const stored = await brain.service.getEntity({
        entityType: "conflict",
        id,
        visibilityScope: "restricted",
      });
      expect(decodeLosingText(stored?.content ?? "")).toBe(text);
    }
  });

  it("is restricted when its target or the losing text is", async () => {
    await seed(brain, "post", "first", doc("First"), "restricted");
    const hidden = await record({ targetVisibility: "restricted" });
    brain.clock.now = new Date("2026-11-18T10:20:31.000Z");
    const raised = await record({
      text: doc("Raised"),
      targetVisibility: "public",
      declaredVisibility: "restricted",
    });

    for (const id of [hidden.conflictId, raised.conflictId]) {
      expect(
        await brain.service.getEntity({
          entityType: "conflict",
          id,
          visibilityScope: "shared",
        }),
      ).toBeNull();
    }
  });

  it("records the same losing text for the same target once", async () => {
    await seed(brain, "post", "first", doc("First"));
    const first = await record();
    brain.clock.now = new Date("2026-11-18T10:25:00.000Z");

    expect(await record()).toEqual({
      conflictId: first.conflictId,
      created: false,
    });
    expect(await brain.store.list()).toHaveLength(1);
  });

  it("gives a second conflict in the same second its own stamp", async () => {
    await seed(brain, "post", "first", doc("First"));
    await record();
    const second = await record({ text: doc("Another edit") });
    const third = await record({ text: doc("A third edit") });

    expect([second, third]).toEqual([
      { conflictId: "post:first:20261118T102030Z-2", created: true },
      { conflictId: "post:first:20261118T102030Z-3", created: true },
    ]);
  });

  it("names a nested target", async () => {
    await seed(brain, "site-content", "home:hero", doc("Hero"));
    const recorded = await record({
      entityType: "site-content",
      entityId: "home:hero",
    });
    expect(recorded.conflictId).toBe("site-content:home:hero:20261118T102030Z");
  });

  it("lists conflicts oldest first and shows a diff from the current version to the losing text", async () => {
    await seed(brain, "post", "first", doc("First"));
    const recorded = await record();
    const [item] = await brain.store.list();
    if (!item) throw new Error("No conflict listed");

    expect(item).toMatchObject({
      conflictId: recorded.conflictId,
      targetType: "post",
      targetId: "first",
      origin: "file",
      created: "2026-11-18T10:20:30.000Z",
    });
    const detail = await brain.store.detail(item.itemId, admin);
    expect(detail).toContain("-title: First");
    expect(detail).toContain("+title: First, from the file");
    expect(detail).toContain("-Body of First");
    expect(detail).toContain("+Body of First, from the file");
  });

  it("applies the losing text over the current version and removes the conflict", async () => {
    await seed(brain, "post", "first", doc("First"));
    await record();
    const [item] = await brain.store.list();
    if (!item) throw new Error("No conflict listed");

    await brain.store.apply(item.itemId, admin);

    const target = await brain.service.getEntity({
      entityType: "post",
      id: "first",
      visibilityScope: "restricted",
      source: true,
    });
    // The brain stores its own form of the text: the fields and the body are the losing file's.
    expect(target?.metadata["title"]).toBe("First, from the file");
    expect(target?.content).toContain("Body of First, from the file");
    expect(target?.content).not.toContain("Body of First\n");
    expect(await brain.store.list()).toEqual([]);
  });

  it("keeps the conflict when the target changed while it was being applied, and shows the new current version", async () => {
    const target = await seed(brain, "post", "first", doc("First"));
    await record();
    const [item] = await brain.store.list();
    if (!item) throw new Error("No conflict listed");
    const update = brain.service.updateEntity.bind(brain.service);
    // Studio saves the entry while the apply is between its read and its write.
    spyOn(brain.service, "updateEntity").mockImplementationOnce(
      async (request) => {
        await update({
          entity: { ...target, content: doc("First, edited in Studio") },
        });
        return update(request);
      },
    );

    expect(await rejection(brain.store.apply(item.itemId, admin))).toContain(
      "changed while",
    );
    const now = await brain.service.getEntity({
      entityType: "post",
      id: "first",
      visibilityScope: "restricted",
      source: true,
    });
    expect(now?.content).toContain("Body of First, edited in Studio");
    expect(await brain.store.list()).toHaveLength(1);
    expect(await brain.store.detail(item.itemId, admin)).toContain(
      "-Body of First, edited in Studio",
    );
  });

  it("holds an apply to the target's action policy and visibility, and keeps the conflict when refused", async () => {
    await seed(brain, "post", "first", doc("First", "status: draft\n"));
    await record({ text: doc("Live", "status: published\n") });
    const [publishing] = await brain.store.list();
    if (!publishing) throw new Error("No conflict listed");

    // Moving into a published status needs the publish action.
    expect(
      await rejection(
        brain.store.apply(publishing.itemId, { permissionLevel: "trusted" }),
      ),
    ).toContain("Publishing requires admin");

    brain.locked.add("post");
    expect(
      await rejection(brain.store.apply(publishing.itemId, admin)),
    ).toContain("is not allowed");
    expect(await brain.store.list()).toHaveLength(1);

    brain.locked.clear();
    await brain.store.apply(publishing.itemId, admin);
    expect(await brain.store.list()).toEqual([]);
  });

  it("refuses to apply a losing text its type cannot read, or one for a target that is gone", async () => {
    await seed(brain, "post", "first", doc("First"));
    await record({ text: "---\ntitle: [unclosed\n---\nbroken\n" });
    const [broken] = await brain.store.list();
    if (!broken) throw new Error("No conflict listed");
    expect(await rejection(brain.store.apply(broken.itemId, admin))).not.toBe(
      "",
    );
    expect(await brain.store.list()).toHaveLength(1);

    await brain.service.deleteEntity({ entityType: "post", id: "first" });
    expect(await rejection(brain.store.apply(broken.itemId, admin))).toContain(
      "no longer exists",
    );
  });

  it("moves a target's pending conflicts with it when it is renamed", async () => {
    await seed(brain, "post", "first", doc("First"));
    const recorded = await record();
    const other = await seed(brain, "post", "second", doc("Second"));
    await brain.store.record({
      entityType: "post",
      entityId: "second",
      origin: "drive",
      current: other.contentHash,
      text: doc("Second, edited"),
      targetVisibility: "public",
    });
    await brain.service.renameEntity({
      entityType: "post",
      id: "first",
      newId: "renamed",
    });

    const moved = await brain.store.followRename("post", "first", "renamed");

    expect(moved).toEqual(["post:renamed:20261118T102030Z"]);
    expect(
      await brain.service.getEntity({
        entityType: "conflict",
        id: recorded.conflictId,
        visibilityScope: "restricted",
      }),
    ).toBeNull();
    const conflict = await brain.service.getEntity({
      entityType: "conflict",
      id: "post:renamed:20261118T102030Z",
      visibilityScope: "restricted",
    });
    expect(conflict?.metadata).toEqual(
      expect.objectContaining({ targetType: "post", targetId: "renamed" }),
    );
    expect(decodeLosingText(conflict?.content ?? "")).toBe(losing);
    // It is applied over the renamed target.
    const item = (await brain.store.list()).find(
      (candidate) => candidate.conflictId === "post:renamed:20261118T102030Z",
    );
    if (!item) throw new Error("The moved conflict is not listed");
    await brain.store.apply(item.itemId, admin);
    expect(
      (
        await brain.service.getEntity({
          entityType: "post",
          id: "renamed",
          visibilityScope: "restricted",
        })
      )?.content,
    ).toContain("First, from the file");
    // Another target's conflict stays where it is.
    expect((await brain.store.list()).map((item) => item.conflictId)).toEqual([
      expect.stringMatching(/^post:second:/),
    ]);
  });

  it("keeps the current version by removing the conflict, and nothing else", async () => {
    await seed(brain, "post", "first", doc("First"));
    await record();
    const [item] = await brain.store.list();
    if (!item) throw new Error("No conflict listed");

    await brain.store.dismiss(item.itemId);

    expect(await brain.store.list()).toEqual([]);
    const target = await brain.service.getEntity({
      entityType: "post",
      id: "first",
      visibilityScope: "restricted",
      source: true,
    });
    expect(target?.content).toContain("Body of First\n");
    expect(await rejection(brain.store.dismiss(item.itemId))).toContain(
      "no longer",
    );
  });

  describe("resolved by the person whose edit it was", () => {
    const editor = {
      userId: "usr_editor",
      permissionLevel: "trusted",
    } as const;
    const other = { userId: "usr_other", permissionLevel: "trusted" } as const;
    const anAdmin = { userId: "usr_admin", permissionLevel: "admin" } as const;
    const current = async (): Promise<string> =>
      (
        await brain.service.getEntity({
          entityType: "post",
          id: "first",
          visibilityScope: "restricted",
          source: true,
        })
      )?.content ?? "";

    it("applies their own conflict, by its id", async () => {
      await seed(brain, "post", "first", doc("First"));
      const { conflictId: id } = await record({
        origin: "studio",
        actor: "usr_editor",
      });

      await brain.store.resolve(id, "apply", editor);

      expect(await current()).toContain("First, from the file");
      expect(await brain.store.list()).toEqual([]);
    });

    it("dismisses their own conflict", async () => {
      await seed(brain, "post", "first", doc("First"));
      const { conflictId: id } = await record({
        origin: "studio",
        actor: "usr_editor",
      });

      await brain.store.resolve(id, "keep-current", editor);

      expect(await current()).not.toContain("from the file");
      expect(await brain.store.list()).toEqual([]);
    });

    it("refuses someone else's conflict, and one nobody is named on", async () => {
      await seed(brain, "post", "first", doc("First"));
      const mine = await record({ origin: "studio", actor: "usr_editor" });
      const unnamed = await record({ text: doc("From a file") });

      for (const id of [mine.conflictId, unnamed.conflictId]) {
        expect(
          await rejection(brain.store.resolve(id, "apply", other)),
        ).toContain("Only the person whose edit this is, or an admin");
      }
      expect(await current()).not.toContain("from the file");
      expect(await brain.store.list()).toHaveLength(2);
    });

    it("lets an admin resolve anyone's", async () => {
      await seed(brain, "post", "first", doc("First"));
      const { conflictId: id } = await record({
        origin: "studio",
        actor: "usr_editor",
      });

      await brain.store.resolve(id, "apply", anAdmin);

      expect(await current()).toContain("First, from the file");
    });

    it("holds their apply to the target's own rules", async () => {
      await seed(brain, "post", "first", doc("First", "status: draft\n"));
      const { conflictId: id } = await record({
        origin: "studio",
        actor: "usr_editor",
        // Publishing needs an admin.
        text: doc("First", "status: published\n"),
      });

      expect(
        await rejection(brain.store.resolve(id, "apply", editor)),
      ).toContain("admin");
      expect(await brain.store.list()).toHaveLength(1);
    });

    it("says so when the conflict is gone", async () => {
      expect(
        await rejection(
          brain.store.resolve("post:first:20261118T102030Z", "apply", editor),
        ),
      ).toContain("no longer exists");
    });
  });
});
