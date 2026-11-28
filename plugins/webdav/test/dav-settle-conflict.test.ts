import { describe, expect, it } from "bun:test";
import { doc, drive, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

const PATH = "/dav/post/first.md";
const SYNC = { "x-brain-sync": "1" };
const laptop: As = { user: "laptop" };

/** A brain holding one conflict: the laptop's save that lost to Studio's. */
async function withConflict(): Promise<{
  brain: FakeBrain;
  dav: ReturnType<typeof drive>;
  conflictId: string;
}> {
  const brain = fakeBrain([
    entity("post", "first", { content: doc("First", "status: draft\n") }),
  ]);
  const dav = drive(brain);
  const read = await dav("GET", PATH, { as: laptop, headers: SYNC });
  const index = brain.entities.findIndex((one) => one.id === "first");
  const current = brain.entities[index];
  if (!current) throw new Error("No such entity");
  brain.entities[index] = {
    ...current,
    content: doc("Studio"),
    contentHash: "hash-after-studio",
  };
  const lost = await dav("PUT", PATH, {
    as: laptop,
    headers: {
      ...SYNC,
      "if-match": read.headers.get("etag") ?? "",
      "x-brain-keep": "conflict",
    },
    body: doc("Mine"),
  });
  const conflictId = lost.headers.get("x-brain-conflict") ?? "";
  expect(conflictId).not.toBe("");
  return { brain, dav, conflictId };
}

const settle = (conflictId: string): string =>
  `/dav/.brain/conflicts/${encodeURIComponent(conflictId)}`;

/**
 * A sync client shows its person both versions and lets them choose. Once
 * they have, the conflict the brain keeps in the Inbox is settled too: the
 * client says so, and the brain dismisses it as that person.
 */
describe("a sync client settling a conflict its person decided", () => {
  it("dismisses the conflict as the person who asked", async () => {
    const { brain, dav, conflictId } = await withConflict();

    const response = await dav("DELETE", settle(conflictId), {
      as: laptop,
      headers: SYNC,
    });

    expect(response.status).toBe(204);
    expect(brain.settled).toEqual([
      {
        conflictId,
        action: "keep-current",
        userId: "laptop",
        permissionLevel: "trusted",
      },
    ]);
  });

  it("says nothing of a conflict: whose it is, or whether there is one", async () => {
    const { brain, dav, conflictId } = await withConflict();
    brain.settleRefusal =
      "Only the person whose edit this is, or an admin, can resolve it";

    // Another person's, one that is not there, and one already settled are
    // all answered as the asker's own is: the service decides, and only it
    // knows.
    const anothers = await dav("DELETE", settle(conflictId), {
      as: { user: "desktop" },
      headers: SYNC,
    });
    const none = await dav("DELETE", settle("post:nothing:20260101T000000Z"), {
      as: { user: "desktop" },
      headers: SYNC,
    });

    expect(anothers.status).toBe(204);
    expect(none.status).toBe(204);
    expect(await anothers.text()).toBe("");
    expect(brain.settled.map((asked) => asked.userId)).toEqual([
      "desktop",
      "desktop",
    ]);
  });

  it("is unavailable on a brain that keeps no conflicts", async () => {
    const { brain, dav, conflictId } = await withConflict();
    brain.conflictsAvailable = false;

    const response = await dav("DELETE", settle(conflictId), {
      as: laptop,
      headers: SYNC,
    });

    expect(response.status).toBe(503);
    expect(brain.settled).toEqual([]);
  });

  it("refuses a read-only app password", async () => {
    const { brain, dav, conflictId } = await withConflict();

    const response = await dav("DELETE", settle(conflictId), {
      as: { ...laptop, access: "read" },
      headers: SYNC,
    });

    expect(response.status).toBe(403);
    expect(brain.settled).toEqual([]);
  });

  it("is not there for a desktop's mount", async () => {
    const { brain, dav, conflictId } = await withConflict();

    const response = await dav("DELETE", settle(conflictId), { as: laptop });

    expect(response.status).toBe(404);
    expect(brain.settled).toEqual([]);
  });

  it("names one conflict, and nothing above or below it", async () => {
    const { brain, dav, conflictId } = await withConflict();

    const folder = await dav("DELETE", "/dav/.brain/conflicts", {
      as: laptop,
      headers: SYNC,
    });
    const below = await dav("DELETE", `${settle(conflictId)}/more`, {
      as: laptop,
      headers: SYNC,
    });

    expect(folder.status).not.toBe(204);
    expect(below.status).not.toBe(204);
    expect(brain.settled).toEqual([]);
  });
});
