import { describe, expect, it } from "bun:test";
import { doc, drive } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain([
    entity("note", "brandbook", { content: doc("Brandbook") }),
    entity("post", "first", { content: doc("First", "status: draft\n") }),
  ]);
}

/**
 * rclone takes a save the drive refuses, or stores in another form than it
 * sent, as a failed upload and deletes the file to clean up after it. On the
 * drive that file is the entity.
 */
describe("WebDAV deletes after a save a client takes as failed", () => {
  it("keeps the entity when the delete follows a refused save", async () => {
    const brain = library();
    const dav = drive(brain);

    const save = await dav("PUT", "/dav/brandbook.md", {
      body: doc("INVALID"),
    });
    const cleanup = await dav("DELETE", "/dav/brandbook.md");

    expect(save.status).toBe(422);
    expect(cleanup.status).toBe(409);
    expect(brain.deletes).toEqual([]);
    const read = await dav("GET", "/dav/brandbook.md");
    expect(read.status).toBe(200);
    expect(await read.text()).toBe(doc("Brandbook"));
  });

  it("keeps the entity when the delete follows a save stored in another form", async () => {
    const brain = library();
    const dav = drive(brain);

    const save = await dav("PUT", "/dav/post/first.md", {
      body: doc("NORMALIZE", "status: draft\n"),
    });
    const cleanup = await dav("DELETE", "/dav/post/first.md");

    expect(save.status).toBe(204);
    expect(save.headers.get("etag")).toBeNull();
    expect(cleanup.status).toBe(409);
    expect(brain.deletes).toEqual([]);
    // Another app password: the one that saved is shown its save as sent.
    const read = await dav("GET", "/dav/post/first.md", {
      as: { level: "admin" },
    });
    expect(await read.text()).toContain("title: Normalized");
  });

  it("keeps the entity through every retry of the same failed upload", async () => {
    const brain = library();
    const clock = { now: 1_800_000_000_000 };
    const dav = drive(brain, clock);

    for (const _retry of [1, 2, 3]) {
      expect(
        (await dav("PUT", "/dav/brandbook.md", { body: doc("INVALID") }))
          .status,
      ).toBe(422);
      expect((await dav("DELETE", "/dav/brandbook.md")).status).toBe(409);
      clock.now += 5 * 60_000;
    }
    expect(brain.deletes).toEqual([]);
  });

  it("deletes after a save stored as sent", async () => {
    const brain = library();
    const dav = drive(brain);

    const save = await dav("PUT", "/dav/post/first.md", {
      body: doc("First, edited", "status: draft\n"),
    });

    expect(save.headers.get("etag")).not.toBeNull();
    expect((await dav("DELETE", "/dav/post/first.md")).status).toBe(204);
    expect(brain.deletes).toEqual([{ entityType: "post", id: "first" }]);
  });

  it("deletes when asked again, by version, by someone else, or later", async () => {
    const refusedSave = async (
      dav: ReturnType<typeof drive>,
    ): Promise<void> => {
      await dav("PUT", "/dav/brandbook.md", { body: doc("INVALID") });
    };

    const again = library();
    const davAgain = drive(again);
    await refusedSave(davAgain);
    expect((await davAgain("DELETE", "/dav/brandbook.md")).status).toBe(409);
    expect((await davAgain("DELETE", "/dav/brandbook.md")).status).toBe(204);

    const byVersion = library();
    const davByVersion = drive(byVersion);
    await refusedSave(davByVersion);
    const etag =
      (await davByVersion("HEAD", "/dav/brandbook.md")).headers.get("etag") ??
      "";
    expect(
      (
        await davByVersion("DELETE", "/dav/brandbook.md", {
          headers: { "if-match": etag },
        })
      ).status,
    ).toBe(204);

    const someoneElse = library();
    const davSomeoneElse = drive(someoneElse);
    await refusedSave(davSomeoneElse);
    expect(
      (
        await davSomeoneElse("DELETE", "/dav/brandbook.md", {
          as: { level: "admin" },
        })
      ).status,
    ).toBe(204);

    const later = library();
    const clock = { now: 1_800_000_000_000 };
    const davLater = drive(later, clock);
    await refusedSave(davLater);
    clock.now += 60_000;
    expect((await davLater("DELETE", "/dav/brandbook.md")).status).toBe(204);
  });
});
