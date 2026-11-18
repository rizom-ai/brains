import { describe, expect, it } from "bun:test";
import { doc, drive, hrefs, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain(
    [
      entity("note", "readme", { content: doc("Readme") }),
      entity("post", "first", { content: doc("First") }),
    ],
    ["note", "post"],
  );
}

const other: As = { user: "usr_other" };

describe("WebDAV hidden items a desktop writes on a mounted drive", () => {
  it("takes the hidden folders macOS makes at the top of a volume", async () => {
    const brain = library();
    const dav = drive(brain);

    for (const folder of [".Trashes", ".TemporaryItems", ".Spotlight-V100"]) {
      expect((await dav("MKCOL", `/dav/${folder}/`)).status).toBe(201);
    }
    expect((await dav("MKCOL", "/dav/.Trashes/")).status).toBe(405);
    expect((await dav("MKCOL", "/dav/.Trashes/501/")).status).toBe(201);
    expect((await dav("MKCOL", "/dav/post/.TemporaryItems/")).status).toBe(201);

    const root = await hrefs(
      await dav("PROPFIND", "/dav/", { headers: { depth: "1" } }),
    );
    expect(root).toContain("/dav/.Trashes/");
    expect(root).toContain("/dav/post/");
    // They are the person's own, like every temporary item.
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/", { as: other, headers: { depth: "1" } }),
      ),
    ).not.toContain("/dav/.Trashes/");
    expect(brain.creates).toEqual([]);
  });

  it("keeps a file inside a hidden folder as a temporary file, whatever its name", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("MKCOL", "/dav/.Trashes/");
    await dav("MKCOL", "/dav/.Trashes/501/");

    const trashed = await dav("PUT", "/dav/.Trashes/501/first.md", {
      body: doc("First, in the trash"),
    });
    expect(trashed.status).toBe(201);
    // No folder made first: a hidden path needs none.
    expect(
      (
        await dav("PUT", "/dav/post/.TemporaryItems/folders.501/draft.md", {
          body: "not an entity at all",
        })
      ).status,
    ).toBe(201);
    expect(brain.creates).toEqual([]);
    expect(brain.updates).toEqual([]);

    const read = await dav("GET", "/dav/.Trashes/501/first.md");
    expect(read.status).toBe(200);
    expect(read.headers.get("content-type")).toBe("application/octet-stream");
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/.Trashes/501/", {
          headers: { depth: "1" },
        }),
      ),
    ).toEqual(["/dav/.Trashes/501/", "/dav/.Trashes/501/first.md"]);
    expect(
      (await dav("GET", "/dav/.Trashes/501/first.md", { as: other })).status,
    ).toBe(404);

    expect((await dav("DELETE", "/dav/.Trashes/")).status).toBe(204);
    expect((await dav("GET", "/dav/.Trashes/501/first.md")).status).toBe(404);
  });

  it("still refuses an ordinary new folder at the top, which no entity type names", async () => {
    const dav = drive(library());
    expect((await dav("MKCOL", "/dav/untitled%20folder/")).status).toBe(403);
    expect((await dav("MKCOL", "/dav/note/")).status).toBe(403);
  });

  it("accepts a property change and stores nothing", async () => {
    const brain = library();
    const dav = drive(brain);
    const body = `<?xml version="1.0"?><D:propertyupdate xmlns:D="DAV:"><D:set><D:prop><D:getlastmodified>Wed, 18 Nov 2026 10:00:00 GMT</D:getlastmodified></D:prop></D:set></D:propertyupdate>`;

    const changed = await dav("PROPPATCH", "/dav/post/first.md", { body });
    expect(changed.status).toBe(207);
    expect(changed.headers.get("content-type")).toBe(
      'application/xml; charset="utf-8"',
    );
    const xml = await changed.text();
    expect(xml).toContain("<D:href>/dav/post/first.md</D:href>");
    expect(xml).toContain("<D:status>HTTP/1.1 200 OK</D:status>");
    expect(brain.updates).toEqual([]);

    await dav("PUT", "/dav/post/.first.md.tmp", { body: "t" });
    expect(
      (await dav("PROPPATCH", "/dav/post/.first.md.tmp", { body })).status,
    ).toBe(207);
    expect((await dav("PROPPATCH", "/dav/post/", { body })).status).toBe(207);
    expect(
      (await dav("PROPPATCH", "/dav/post/missing.md", { body })).status,
    ).toBe(404);
    expect(
      (
        await dav("PROPPATCH", "/dav/post/first.md", {
          as: { access: "read" },
          body,
        })
      ).status,
    ).toBe(403);
  });
});
