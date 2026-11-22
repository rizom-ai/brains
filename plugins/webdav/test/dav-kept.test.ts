import { describe, expect, it } from "bun:test";
import { SCRATCH_IDLE_MS } from "../src/dav-scratch";
import { KEPT_CAP_BYTES } from "../src/dav-kept";
import { doc, drive, hrefs, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain(
    [entity("note", "readme", { content: doc("Readme") })],
    ["note"],
  );
}

const other: As = { user: "usr_other" };
const WORKSPACE = "/dav/.obsidian/workspace.json";

/**
 * Obsidian keeps a vault's settings, open tabs and plugins in `.obsidian`
 * at the vault's root. On the drive that folder is the person's own, as
 * every hidden folder is, but it is kept: a vault that forgot its settings
 * every ten minutes would not be one.
 */
describe("the drive as an Obsidian vault", () => {
  it("keeps what Obsidian writes into .obsidian past the time temporary files live", async () => {
    const brain = library();
    const clock = { now: 1_800_000_000_000 };
    const dav = drive(brain, clock);

    expect((await dav("MKCOL", "/dav/.obsidian/")).status).toBe(201);
    expect((await dav("PUT", WORKSPACE, { body: '{"main":{}}' })).status).toBe(
      201,
    );
    await dav("PUT", "/dav/.Trashes/gone.md", { body: "temporary" });
    clock.now += SCRATCH_IDLE_MS + 1;

    const kept = await dav("GET", WORKSPACE);
    expect(kept.status).toBe(200);
    expect(await kept.text()).toBe('{"main":{}}');
    expect((await dav("GET", "/dav/.Trashes/gone.md")).status).toBe(404);
    expect(
      await hrefs(await dav("PROPFIND", "/dav/", { headers: { depth: "1" } })),
    ).toContain("/dav/.obsidian/");
  });

  it("still has it after the brain restarts", async () => {
    const brain = library();
    const before = drive(brain);
    await before("MKCOL", "/dav/.obsidian/");
    await before("MKCOL", "/dav/.obsidian/plugins/");
    await before("MKCOL", "/dav/.obsidian/plugins/calendar/");
    await before("PUT", WORKSPACE, { body: "first" });
    await before("PUT", WORKSPACE, { body: "second" });
    await before("PUT", "/dav/.obsidian/plugins/calendar/main.js", {
      body: "plugin code",
    });

    // A new server over the same brain: nothing is in memory.
    const after = drive(brain);

    expect(await (await after("GET", WORKSPACE)).text()).toBe("second");
    expect(
      await (
        await after("GET", "/dav/.obsidian/plugins/calendar/main.js")
      ).text(),
    ).toBe("plugin code");
    expect(
      await hrefs(
        await after("PROPFIND", "/dav/.obsidian/", { headers: { depth: "1" } }),
      ),
    ).toEqual([
      "/dav/.obsidian/",
      "/dav/.obsidian/plugins/",
      "/dav/.obsidian/workspace.json",
    ]);
    expect(
      await hrefs(
        await after("PROPFIND", "/dav/.obsidian/plugins/", {
          headers: { depth: "1" },
        }),
      ),
    ).toContain("/dav/.obsidian/plugins/calendar/");
    // Making the folder again finds it there.
    expect((await after("MKCOL", "/dav/.obsidian/")).status).toBe(405);
  });

  it("is each person's own", async () => {
    const brain = library();
    await drive(brain)("PUT", WORKSPACE, { body: "mine" });

    const theirs = drive(brain);
    expect((await theirs("GET", WORKSPACE, { as: other })).status).toBe(404);
    expect(
      await hrefs(
        await theirs("PROPFIND", "/dav/", {
          as: other,
          headers: { depth: "1" },
        }),
      ),
    ).not.toContain("/dav/.obsidian/");
  });

  it("forgets what Obsidian deletes or renames, also after a restart", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("PUT", WORKSPACE, { body: "state" });
    await dav("PUT", "/dav/.obsidian/workspace.json.tmp", { body: "next" });
    await dav("PUT", "/dav/.obsidian/plugins/calendar/main.js", { body: "x" });

    // Obsidian saves by writing a temporary file and renaming it.
    expect(
      (
        await dav("MOVE", "/dav/.obsidian/workspace.json.tmp", {
          headers: { destination: `https://brain.example${WORKSPACE}` },
        })
      ).status,
    ).toBe(204);
    expect((await dav("DELETE", "/dav/.obsidian/plugins/")).status).toBe(204);

    const after = drive(brain);
    expect(await (await after("GET", WORKSPACE)).text()).toBe("next");
    expect(
      (await after("GET", "/dav/.obsidian/workspace.json.tmp")).status,
    ).toBe(404);
    expect(
      (await after("GET", "/dav/.obsidian/plugins/calendar/main.js")).status,
    ).toBe(404);
  });

  it("holds a bounded amount for one person", async () => {
    const brain = library();
    const dav = drive(brain);
    brain.options.writes.maxAssetBytes = KEPT_CAP_BYTES;
    const half = new Uint8Array(KEPT_CAP_BYTES / 2 + 1);

    expect(
      (await dav("PUT", "/dav/.obsidian/a.bin", { body: half })).status,
    ).toBe(201);
    expect(
      (await dav("PUT", "/dav/.obsidian/b.bin", { body: half })).status,
    ).toBe(507);
    // Another person has their own room.
    expect(
      (await dav("PUT", "/dav/.obsidian/b.bin", { as: other, body: half }))
        .status,
    ).toBe(201);
  });

  it("makes no entity of anything inside it", async () => {
    const brain = library();
    const dav = drive(brain);

    await dav("PUT", "/dav/.obsidian/snippets/note.md", {
      body: doc("Not a note"),
    });

    expect(brain.creates).toEqual([]);
    expect(
      await (
        await drive(brain)("GET", "/dav/.obsidian/snippets/note.md")
      ).text(),
    ).toBe(doc("Not a note"));
  });
});
