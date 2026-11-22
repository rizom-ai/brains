import { describe, expect, it } from "bun:test";
import { dest, doc, drive, hrefs, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain(
    [
      entity("note", "4HH3lCLYIc_Z", { content: doc("Tea notes") }),
      entity("note", "other", { content: doc("Other") }),
      entity("note", "team-only", {
        content: doc("Team", "visibility: restricted\n"),
        visibility: "restricted",
      }),
      entity("post", "first", { content: doc("First") }),
      entity("locked", "rules", { content: doc("Rules") }),
    ],
    ["note", "post", "locked"],
  );
}

const NOTE = "/dav/4HH3lCLYIc_Z.md";
const ids = (brain: FakeBrain): string[] =>
  brain.entities.map((candidate) => `${candidate.entityType}/${candidate.id}`);

/**
 * A notes app shows a file's name as the note's name, and renaming is how a
 * person fixes one. On the drive a note's file name is its id, so renaming
 * the file renames the note: the same note under another id.
 */
describe("renaming a note on the drive", () => {
  it("renames the note itself and keeps everything else about it", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("MOVE", NOTE, {
      headers: dest("/dav/tea-notes.md"),
    });

    expect(response.status).toBe(201);
    expect(brain.renames).toEqual([
      {
        entityType: "note",
        id: "4HH3lCLYIc_Z",
        newId: "tea-notes",
        expectedContentHash: "hash-note-4HH3lCLYIc_Z",
        actorUserId: "usr_trusted",
        interfaceType: "webdav",
      },
    ]);
    expect(ids(brain)).toContain("note/tea-notes");
    expect(ids(brain)).not.toContain("note/4HH3lCLYIc_Z");
    expect((await dav("GET", NOTE)).status).toBe(404);
    const renamed = await dav("GET", "/dav/tea-notes.md");
    expect(await renamed.text()).toBe(doc("Tea notes"));
    expect(
      await hrefs(await dav("PROPFIND", "/dav/", { headers: { depth: "1" } })),
    ).toContain("/dav/tea-notes.md");
  });

  it("keeps a name with spaces and capitals as it was typed", async () => {
    const brain = library();

    const response = await drive(brain)("MOVE", NOTE, {
      headers: dest("/dav/Tea%20Notes.md"),
    });

    expect(response.status).toBe(201);
    expect(ids(brain)).toContain("note/Tea Notes");
  });

  it("refuses a name that is taken, whatever the client says about overwriting", async () => {
    const brain = library();
    const dav = drive(brain);

    for (const overwrite of ["T", "F"]) {
      const response = await dav("MOVE", NOTE, {
        headers: { ...dest("/dav/other.md"), overwrite },
      });
      expect(response.status).toBe(412);
    }
    expect(brain.renames).toEqual([]);
    expect(ids(brain)).toContain("note/4HH3lCLYIc_Z");
  });

  it("is an update, held to the person's rights over the note", async () => {
    const brain = library();
    const dav = drive(brain);
    const readOnly: As = { access: "read" };

    expect(
      (await dav("MOVE", NOTE, { as: readOnly, headers: dest("/dav/x.md") }))
        .status,
    ).toBe(403);
    // A note above the caller's reach is not there to rename.
    expect(
      (await dav("MOVE", "/dav/team-only.md", { headers: dest("/dav/x.md") }))
        .status,
    ).toBe(404);
    expect(brain.renames).toEqual([]);
  });

  it("renames notes only: other types keep their names", async () => {
    const brain = library();
    const dav = drive(brain);

    expect(
      (
        await dav("MOVE", "/dav/post/first.md", {
          headers: dest("/dav/post/second.md"),
        })
      ).status,
    ).toBe(403);
    // A note does not become another type by being moved into its folder.
    expect(
      (await dav("MOVE", NOTE, { headers: dest("/dav/post/tea.md") })).status,
    ).toBe(403);
    expect(
      (await dav("MOVE", NOTE, { headers: dest("/dav/paper.pdf") })).status,
    ).toBe(403);
    expect(brain.renames).toEqual([]);
  });

  it("does not rename a note that changed since the client last saw it", async () => {
    const brain = library();
    brain.beforeNextUpdate = (): void => {
      const index = brain.entities.findIndex((c) => c.id === "4HH3lCLYIc_Z");
      const current = brain.entities[index];
      if (current) {
        brain.entities[index] = { ...current, contentHash: "hash-newer" };
      }
    };

    const response = await drive(brain)("MOVE", NOTE, {
      headers: dest("/dav/tea-notes.md"),
    });

    expect(response.status).toBe(412);
    expect(ids(brain)).toContain("note/4HH3lCLYIc_Z");
  });

  it("still takes a rename onto a backup name as the editor's backup", async () => {
    const brain = library();

    const response = await drive(brain)("MOVE", NOTE, {
      headers: dest("/dav/4HH3lCLYIc_Z.md~"),
    });

    expect(response.status).toBe(201);
    expect(brain.renames).toEqual([]);
    expect(ids(brain)).toContain("note/4HH3lCLYIc_Z");
  });
});
