import { describe, expect, it } from "bun:test";
import { doc, drive, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain([
    entity("post", "first", { content: doc("First", "status: draft\n") }),
    entity("post", "team-only", {
      content: doc("Team", "visibility: shared\n"),
      visibility: "shared",
    }),
    entity("conflict", "post:first:20261118T102030Z", {
      content: doc("A conflict"),
      visibility: "shared",
    }),
  ]);
}

const PATH = "/dav/post/first.md";
const laptop: As = { user: "laptop" };
const desktop: As = { user: "desktop" };

function stored(brain: FakeBrain, id = "first"): string {
  return brain.entities.find((candidate) => candidate.id === id)?.content ?? "";
}

/** Another writer changes the entry: Studio, an agent, a file import. */
function editInBrain(brain: FakeBrain, text: string, id = "first"): void {
  const index = brain.entities.findIndex((candidate) => candidate.id === id);
  const current = brain.entities[index];
  if (!current) throw new Error("No such entity");
  brain.entities[index] = {
    ...current,
    content: text,
    contentHash: `hash-after-${text.length}`,
  };
}

describe("a drive save over a newer version", () => {
  it("refuses a save that names an older version, and keeps no conflict", async () => {
    const brain = library();
    const dav = drive(brain);
    const read = await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    const response = await dav("PUT", PATH, {
      as: laptop,
      headers: { "if-match": read.headers.get("etag") ?? "" },
      body: doc("Mine"),
    });

    expect(response.status).toBe(412);
    expect(brain.conflicts).toEqual([]);
    expect(stored(brain)).toBe(doc("Studio"));
  });

  it("keeps a save without a named version as a conflict when the mount read an older one", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    const response = await dav("PUT", PATH, { as: laptop, body: doc("Mine") });

    expect(response.status).toBe(204);
    expect(response.headers.get("etag")).toBeNull();
    expect(stored(brain)).toBe(doc("Studio"));
    expect(brain.conflicts).toEqual([
      {
        entityType: "post",
        entityId: "first",
        origin: "drive",
        actor: "laptop",
        base: "hash-post-first",
        current: `hash-after-${doc("Studio").length}`,
        text: doc("Mine"),
        targetVisibility: "public",
      },
    ]);
  });

  it("goes by a base a HEAD set, and still knows it after a restart", async () => {
    const brain = library();
    await drive(brain)("HEAD", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    // A new server over the same brain: the base is not in memory.
    const response = await drive(brain)("PUT", PATH, {
      as: laptop,
      body: doc("Mine"),
    });

    expect(response.status).toBe(204);
    expect(brain.conflicts).toHaveLength(1);
  });

  it("does not take a listing for a read", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("PROPFIND", "/dav/post/", {
      as: laptop,
      headers: { depth: "1" },
    });
    editInBrain(brain, doc("Studio"));

    await dav("PUT", PATH, { as: laptop, body: doc("Mine") });

    expect(stored(brain)).toBe(doc("Mine"));
    expect(brain.conflicts).toEqual([]);
  });

  it("saves over the current version when the mount holds no base", async () => {
    const brain = library();
    editInBrain(brain, doc("Studio"));

    const response = await drive(brain)("PUT", PATH, {
      as: laptop,
      body: doc("Mine"),
    });

    expect(response.status).toBe(204);
    expect(stored(brain)).toBe(doc("Mine"));
    expect(brain.conflicts).toEqual([]);
  });

  it("takes a mount's own save as its base, so its next save is no conflict", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });

    await dav("PUT", PATH, { as: laptop, body: doc("Once") });
    const again = await dav("PUT", PATH, { as: laptop, body: doc("Twice") });

    expect(again.status).toBe(204);
    expect(stored(brain)).toBe(doc("Twice"));
    expect(brain.conflicts).toEqual([]);
  });

  it("keeps a base per mount", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    await dav("GET", PATH, { as: desktop });

    await dav("PUT", PATH, { as: laptop, body: doc("From the laptop") });
    await dav("PUT", PATH, { as: desktop, body: doc("From the desktop") });
    await dav("PUT", PATH, { as: laptop, body: doc("Laptop again") });

    expect(stored(brain)).toBe(doc("Laptop again"));
    expect(brain.conflicts.map((conflict) => conflict.text)).toEqual([
      doc("From the desktop"),
    ]);
  });

  it("takes a save that changes nothing for a save, whatever the mount's base", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    const response = await dav("PUT", PATH, {
      as: laptop,
      body: doc("Studio"),
    });

    expect(response.status).toBe(204);
    expect(brain.conflicts).toEqual([]);
    expect(brain.updates).toEqual([]);
  });

  it("keeps one conflict when the same losing save comes again", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    await dav("PUT", PATH, { as: laptop, body: doc("Mine") });
    // The conflict was resolved meanwhile; rclone retries the same bytes.
    brain.conflicts.length = 0;
    const retry = await dav("PUT", PATH, { as: laptop, body: doc("Mine") });

    expect(retry.status).toBe(204);
    expect(brain.conflicts).toEqual([]);
    expect(stored(brain)).toBe(doc("Studio"));
  });

  it("saves again once the mount has read the newer version", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));
    await dav("PUT", PATH, { as: laptop, body: doc("Mine") });

    await dav("GET", PATH, { as: laptop });
    const response = await dav("PUT", PATH, { as: laptop, body: doc("Mine") });

    expect(response.status).toBe(204);
    expect(stored(brain)).toBe(doc("Mine"));
    expect(brain.conflicts).toHaveLength(1);
  });

  it("carries the visibility the losing text declares", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    await dav("PUT", PATH, {
      as: laptop,
      body: doc("Mine", "visibility: shared\n"),
    });

    expect(brain.conflicts[0]?.declaredVisibility).toBe("shared");
  });

  it("refuses the save when nothing can hold the conflict", async () => {
    const brain = library();
    brain.conflictsAvailable = false;
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    const response = await dav("PUT", PATH, { as: laptop, body: doc("Mine") });

    expect(response.status).toBe(412);
    expect(stored(brain)).toBe(doc("Studio"));
  });

  it("keeps no conflict for a person who may not change the entry", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", "/dav/post/team-only.md", { as: laptop });
    editInBrain(brain, doc("Studio", "visibility: restricted\n"), "team-only");
    const index = brain.entities.findIndex((c) => c.id === "team-only");
    const current = brain.entities[index];
    if (current)
      brain.entities[index] = { ...current, visibility: "restricted" };

    const response = await dav("PUT", "/dav/post/team-only.md", {
      as: laptop,
      body: doc("Mine"),
    });

    expect(response.status).not.toBe(204);
    expect(brain.conflicts).toEqual([]);
  });
});

describe("a drive delete over a newer version", () => {
  it("deletes nothing when the mount read an older version", async () => {
    const brain = library();
    const dav = drive(brain);
    const read = await dav("GET", PATH, { as: laptop });
    editInBrain(brain, doc("Studio"));

    const named = await dav("DELETE", PATH, {
      as: laptop,
      headers: { "if-match": read.headers.get("etag") ?? "" },
    });
    const unnamed = await dav("DELETE", PATH, { as: laptop });

    expect(named.status).toBe(412);
    expect(unnamed.status).toBe(409);
    expect(stored(brain)).toBe(doc("Studio"));
    expect(brain.conflicts).toEqual([]);
  });

  it("deletes the version the mount read", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });

    expect((await dav("DELETE", PATH, { as: laptop })).status).toBe(204);
    expect(brain.deletes).toEqual([{ entityType: "post", id: "first" }]);
  });
});

describe("the drive and conflict files", () => {
  const CONFLICT = "/dav/conflict/post/first/20261118T102030Z.md";

  it("serves a conflict to read and refuses to write or delete one", async () => {
    const brain = library();
    const dav = drive(brain, undefined);
    const admin: As = { level: "admin" };

    expect((await dav("GET", CONFLICT, { as: admin })).status).toBe(200);
    // Before the refused save: a delete right after one is held back anyway.
    expect((await dav("DELETE", CONFLICT, { as: admin })).status).toBe(403);
    expect(
      (await dav("PUT", CONFLICT, { as: admin, body: doc("Edited") })).status,
    ).toBe(403);
    expect(
      (
        await dav("PUT", "/dav/conflict/post/first/20261118T999999Z.md", {
          as: admin,
          body: doc("New"),
        })
      ).status,
    ).toBe(403);
    expect(stored(brain, "post:first:20261118T102030Z")).toBe(
      doc("A conflict"),
    );
  });
});
