import { describe, expect, it } from "bun:test";
import { dest, doc, drive, hrefs } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain(
    [
      entity("note", "readme", { content: doc("Readme") }),
      entity("post", "first", { content: doc("First", "status: draft\n") }),
      entity("post", "board-only", { visibility: "restricted" }),
      entity("locked", "rules", { content: doc("Rules") }),
      entity("image", "cover", {
        content: `asset://sha256/${"a".repeat(64)}`,
        metadata: { format: "png" },
      }),
    ],
    ["note", "post", "locked", "image", "site-content"],
  );
}

describe("WebDAV creating files", () => {
  it("creates the entity a new file names, as its author, only if absent", async () => {
    const brain = library();
    const dav = drive(brain);
    const body = doc("Brand new", "status: draft\n");

    const response = await dav("PUT", "/dav/post/brand-new.md", { body });

    expect(response.status).toBe(201);
    expect(response.headers.get("etag")).toBe('"hash-created-brand-new"');
    expect(brain.creates).toEqual([
      expect.objectContaining({
        interfaceType: "webdav",
        actorUserId: "usr_trusted",
        entity: expect.objectContaining({
          entityType: "post",
          id: "brand-new",
          content: body,
          visibility: "public",
          metadata: { title: "Brand new", status: "draft" },
        }),
      }),
    ]);
    expect(brain.audit).toEqual([
      {
        actorUserId: "usr_trusted",
        action: "webdav.entity.create.allowed",
        targetType: "entity",
        targetId: "brand-new",
        metadata: {
          entityType: "post",
          interfaceType: "webdav",
          outcome: "allowed",
        },
      },
    ]);
    expect(await (await dav("GET", "/dav/post/brand-new.md")).text()).toBe(
      body,
    );
  });

  it("creates a note at the root", async () => {
    const brain = library();
    const response = await drive(brain)("PUT", "/dav/ideas.md", {
      body: doc("Ideas"),
    });
    expect(response.status).toBe(201);
    expect(brain.creates[0]?.entity).toMatchObject({
      entityType: "note",
      id: "ideas",
    });
  });

  it("takes the visibility the file names, within the caller's level", async () => {
    const brain = library();
    const dav = drive(brain);
    expect(
      (
        await dav("PUT", "/dav/post/team.md", {
          body: doc("Team", "visibility: shared\n"),
        })
      ).status,
    ).toBe(201);
    expect(brain.creates[0]?.entity.visibility).toBe("shared");

    const above = await dav("PUT", "/dav/post/board.md", {
      body: doc("Board", "visibility: restricted\n"),
    });
    expect(above.status).toBe(403);
    expect(brain.audit.at(-1)).toMatchObject({
      action: "webdav.entity.create.denied",
      metadata: { reason: "visibility-policy" },
    });
    expect(brain.creates).toHaveLength(1);
  });

  it("applies validation, the create policy and the publish boundary to a new file", async () => {
    const brain = library();
    const dav = drive(brain);

    const invalid = await dav("PUT", "/dav/post/bad.md", {
      body: doc("INVALID"),
    });
    expect(invalid.status).toBe(422);

    const locked = await dav("PUT", "/dav/locked/more.md", {
      body: doc("More"),
    });
    expect(locked.status).toBe(403);
    expect(brain.audit.at(-1)).toMatchObject({
      action: "webdav.entity.create.denied",
      metadata: { entityType: "locked", reason: "entity-action-policy" },
    });

    const published = doc("Live", "status: published\n");
    expect(
      (await dav("PUT", "/dav/post/live.md", { body: published })).status,
    ).toBe(403);
    expect(
      (
        await dav("PUT", "/dav/post/live.md", {
          as: { level: "admin" },
          body: published,
        })
      ).status,
    ).toBe(201);
    expect(brain.creates.map((created) => created.entity.id)).toEqual(["live"]);
  });

  it("answers a conflict when the id is taken by an entity the caller cannot see", async () => {
    const brain = library();
    const response = await drive(brain)("PUT", "/dav/post/board-only.md", {
      body: doc("Mine"),
    });
    expect(response.status).toBe(412);
    expect(brain.creates).toEqual([]);
  });

  it("saves only if absent when the client asks for that", async () => {
    const brain = library();
    const dav = drive(brain);
    const onlyIfAbsent = { "if-none-match": "*" };

    expect(
      (
        await dav("PUT", "/dav/post/first.md", {
          headers: onlyIfAbsent,
          body: doc("Overwrite?"),
        })
      ).status,
    ).toBe(412);
    expect(brain.updates).toEqual([]);
    expect(
      (
        await dav("PUT", "/dav/post/fresh.md", {
          headers: onlyIfAbsent,
          body: doc("Fresh"),
        })
      ).status,
    ).toBe(201);
  });

  it("refuses a path no entity can live at", async () => {
    const brain = library();
    const dav = drive(brain);
    for (const path of [
      // Binaries arrive with a later phase.
      "/dav/post/photo.png",
      // The name does not read back as the id it would be stored under.
      "/dav/post/a%3Ab.md",
    ]) {
      expect((await dav("PUT", path, { body: doc("X") })).status).toBe(403);
    }
    for (const path of [
      // A note lives at the root: there is no `note` folder.
      "/dav/note/x.md",
      // Not a registered type, so no such folder.
      "/dav/unknown/x.md",
      "/dav/a/b.md",
    ]) {
      expect((await dav("PUT", path, { body: doc("X") })).status).toBe(409);
    }
    expect(brain.creates).toEqual([]);
  });

  it("needs the folder to exist before a file is created inside it", async () => {
    const brain = library();
    const dav = drive(brain);
    const body = doc("Hero");

    expect(
      (await dav("PUT", "/dav/site-content/home/hero.md", { body })).status,
    ).toBe(409);
    expect((await dav("MKCOL", "/dav/site-content/home/")).status).toBe(409);
    expect((await dav("MKCOL", "/dav/site-content/")).status).toBe(201);
    expect((await dav("MKCOL", "/dav/site-content/home")).status).toBe(201);

    expect(
      await hrefs(await dav("PROPFIND", "/dav/", { headers: { depth: "1" } })),
    ).toContain("/dav/site-content/");
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/site-content/", {
          headers: { depth: "1" },
        }),
      ),
    ).toEqual(["/dav/site-content/", "/dav/site-content/home/"]);
    // New folders are the person's own until something is saved in them.
    expect(
      (
        await dav("PROPFIND", "/dav/site-content/", {
          as: { user: "usr_other" },
          headers: { depth: "0" },
        })
      ).status,
    ).toBe(404);

    expect(
      (await dav("PUT", "/dav/site-content/home/hero.md", { body })).status,
    ).toBe(201);
    expect(brain.creates[0]?.entity).toMatchObject({
      entityType: "site-content",
      id: "home:hero",
    });
    // The folder is real now, for everyone who may see the entity.
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/site-content/home/", {
          as: { user: "usr_other" },
          headers: { depth: "1" },
        }),
      ),
    ).toEqual(["/dav/site-content/home/", "/dav/site-content/home/hero.md"]);
  });

  it("answers MKCOL on a folder that exists as rclone expects, and refuses the rest", async () => {
    const dav = drive(library());
    expect((await dav("MKCOL", "/dav/post/")).status).toBe(405);
    expect((await dav("MKCOL", "/dav/")).status).toBe(405);
    expect((await dav("MKCOL", "/dav/site-content/")).status).toBe(201);
    expect((await dav("MKCOL", "/dav/site-content/")).status).toBe(405);
    // Only a registered type can be a top-level folder.
    expect((await dav("MKCOL", "/dav/unknown/")).status).toBe(403);
    expect((await dav("MKCOL", "/dav/note/")).status).toBe(403);
    expect((await dav("MKCOL", "/dav/post/first.md")).status).toBe(405);
    expect(
      (await dav("MKCOL", "/dav/post/sub/", { body: "<x/>" })).status,
    ).toBe(415);
    expect(
      (await dav("MKCOL", "/dav/post/sub/", { as: { access: "read" } })).status,
    ).toBe(403);
  });

  it("forgets a new folder left empty for ten minutes, and removes one on request", async () => {
    const clock = { now: 1_800_000_000_000 };
    const dav = drive(library(), clock);
    await dav("MKCOL", "/dav/post/drafts/");
    expect(
      (await dav("PROPFIND", "/dav/post/drafts/", { headers: { depth: "0" } }))
        .status,
    ).toBe(207);
    expect((await dav("DELETE", "/dav/post/drafts/")).status).toBe(204);
    expect(
      (await dav("PROPFIND", "/dav/post/drafts/", { headers: { depth: "0" } }))
        .status,
    ).toBe(404);

    await dav("MKCOL", "/dav/post/later/");
    clock.now += 10 * 60 * 1000;
    expect(
      (await dav("PROPFIND", "/dav/post/later/", { headers: { depth: "0" } }))
        .status,
    ).toBe(404);
  });

  it("creates when an editor renames its temporary file onto a new name", async () => {
    const brain = library();
    const dav = drive(brain);
    const body = doc("Via rename");
    await dav("PUT", "/dav/post/.new.md.tmp", { body });

    const moved = await dav("MOVE", "/dav/post/.new.md.tmp", {
      headers: dest("/dav/post/via-rename.md"),
    });

    expect(moved.status).toBe(201);
    expect(brain.creates[0]?.entity).toMatchObject({
      id: "via-rename",
      content: body,
    });
    expect((await dav("GET", "/dav/post/.new.md.tmp")).status).toBe(404);
  });
});

describe("WebDAV deleting files", () => {
  it("deletes the entity a file is, and records it", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("DELETE", "/dav/post/first.md");

    expect(response.status).toBe(204);
    expect(brain.deletes).toEqual([{ entityType: "post", id: "first" }]);
    expect((await dav("GET", "/dav/post/first.md")).status).toBe(404);
    expect(brain.audit).toEqual([
      {
        actorUserId: "usr_trusted",
        action: "webdav.entity.delete.allowed",
        targetType: "entity",
        targetId: "first",
        metadata: {
          entityType: "post",
          interfaceType: "webdav",
          outcome: "allowed",
        },
      },
    ]);
  });

  it("deletes only the version the client names, and never one changed in flight", async () => {
    const brain = library();
    const dav = drive(brain);
    expect(
      (
        await dav("DELETE", "/dav/post/first.md", {
          headers: { "if-match": '"older"' },
        })
      ).status,
    ).toBe(412);

    brain.beforeNextUpdate = (): void => {
      const index = brain.entities.findIndex((c) => c.id === "first");
      const current = brain.entities[index];
      if (current)
        brain.entities[index] = { ...current, contentHash: "moved-on" };
    };
    expect((await dav("DELETE", "/dav/post/first.md")).status).toBe(412);
    expect(brain.deletes).toEqual([]);

    expect(
      (
        await dav("DELETE", "/dav/post/first.md", {
          headers: { "if-match": '"moved-on"' },
        })
      ).status,
    ).toBe(204);
  });

  it("applies the delete policy, hides what the caller cannot see and keeps folders", async () => {
    const brain = library();
    const dav = drive(brain);

    expect((await dav("DELETE", "/dav/locked/rules.md")).status).toBe(403);
    expect(brain.audit.at(-1)).toMatchObject({
      action: "webdav.entity.delete.denied",
      metadata: { reason: "entity-action-policy" },
    });
    expect((await dav("DELETE", "/dav/post/board-only.md")).status).toBe(404);
    expect((await dav("DELETE", "/dav/post/missing.md")).status).toBe(404);
    expect((await dav("DELETE", "/dav/post/")).status).toBe(403);
    expect((await dav("DELETE", "/dav/")).status).toBe(403);
    expect(
      (await dav("DELETE", "/dav/post/first.md", { as: { access: "read" } }))
        .status,
    ).toBe(403);
    expect(brain.deletes).toEqual([]);
  });
});
