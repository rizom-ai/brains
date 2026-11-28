import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { HttpRequest, HttpResponse } from "../src";
import { connect, fresh, stored, type Synced } from "../src/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

async function withTea(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
  await connect(made);
  return made;
}

/** Answer some requests otherwise than the brain would; pass the rest on. */
function intercept(
  made: Synced,
  answer: (request: HttpRequest) => HttpResponse | undefined,
): void {
  const reachable = made.brain.fetch;
  made.brain.fetch = async (request): Promise<HttpResponse> =>
    answer(request) ?? reachable(request);
}

const gateway = (status: number): HttpResponse => ({
  status,
  headers: {},
  body: new TextEncoder().encode("Bad Gateway"),
});

/** What the review of the first build found; each case lost or risked work. */
describe("a sync never loses a person's work", () => {
  it("sends an edit made while the one before it was uploading", async () => {
    synced = await withTea();
    const vault = synced.vault;
    synced.vault.setText("tea.md", "# Tea\n\nEdit one.\n");
    const reachable = synced.brain.fetch;
    let typed = false;
    synced.brain.fetch = async (request): Promise<HttpResponse> => {
      const response = await reachable(request);
      // The person saves again while the first upload is on its way.
      if (request.method === "PUT" && !typed) {
        typed = true;
        vault.setText("tea.md", "# Tea\n\nEdit two.\n");
      }
      return response;
    };
    await synced.engine.sync();
    synced.brain.fetch = reachable;

    await synced.engine.sync();

    expect(await stored(synced, "tea")).toBe("# Tea\n\nEdit two.\n");
    expect(vault.text("tea.md")).toBe("# Tea\n\nEdit two.\n");
  });

  it("forgets a delete when the file comes back, so a later disappearance asks", async () => {
    synced = await withTea();
    const kept = synced.vault.text("tea.md") ?? "";
    await synced.vault.trash("tea.md");
    await synced.engine.noteDeleted("tea.md");
    // Restored from the trash before the next sync.
    synced.vault.setText("tea.md", kept);
    await synced.engine.sync();
    expect(synced.store.current.deletes).toEqual([]);

    // Later the file goes missing without Obsidian seeing a delete.
    synced.vault.files.delete("tea.md");
    const report = await synced.engine.sync();

    expect(report.deletedInBrain).toEqual([]);
    expect(report.decision?.localMissing).toEqual(["tea.md"]);
    expect(await synced.brain.get("note", "tea")).not.toBeNull();
  });

  it("forgets a delete the brain refused because the entry had changed", async () => {
    synced = await withTea();
    await synced.vault.trash("tea.md");
    await synced.engine.noteDeleted("tea.md");
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");
    await synced.engine.sync();
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nFrom Studio.\n");

    expect(synced.store.current.deletes).toEqual([]);
  });

  it("keeps a rename for later when the brain answers with a server error", async () => {
    synced = await withTea();
    await synced.vault.rename("tea.md", "green-tea.md");
    await synced.engine.noteRenamed("tea.md", "green-tea.md");
    const reachable = synced.brain.fetch;
    intercept(synced, (request) =>
      request.method === "MOVE" ? gateway(502) : undefined,
    );

    const report = await synced.engine.sync();

    expect(report.status).toBe("unavailable");
    expect(report.notices).toEqual([]);
    expect(await synced.vault.exists("green-tea.md")).toBe(true);
    synced.brain.fetch = reachable;
    await synced.engine.sync();
    expect(await stored(synced, "green-tea")).toBe("# Tea\n\nSteep it.\n");
    expect(await synced.brain.get("note", "tea")).toBeNull();
  });

  it("keeps a delete for later when the brain answers with a server error", async () => {
    synced = await withTea();
    await synced.vault.trash("tea.md");
    await synced.engine.noteDeleted("tea.md");
    const reachable = synced.brain.fetch;
    intercept(synced, (request) =>
      request.method === "DELETE" ? gateway(503) : undefined,
    );

    const report = await synced.engine.sync();

    expect(report.status).toBe("unavailable");
    expect(await synced.vault.exists("tea.md")).toBe(false);
    synced.brain.fetch = reachable;
    const later = await synced.engine.sync();
    expect(later.deletedInBrain).toEqual(["tea.md"]);
  });

  it("keeps a note's embed of an image the brain refused, and says why", async () => {
    synced = await withTea();
    await synced.vault.write(
      "image/photo.png",
      new TextEncoder().encode("not a picture"),
    );
    synced.vault.setText("tea.md", "# Tea\n\n![[photo.png]]\n");

    const report = await synced.engine.sync();

    expect(await stored(synced, "tea")).toBe("# Tea\n\n![[photo.png]]\n");
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\n![[photo.png]]\n");
    expect(
      report.issues.some(
        (issue) => issue.path === "tea.md" && issue.reason.includes("photo"),
      ),
    ).toBe(true);
  });

  it("translates embeds when a file the brain deleted is kept and sent back", async () => {
    synced = await fresh();
    const PNG = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      ),
      (char) => char.charCodeAt(0),
    );
    const ids = ["a", "b", "c", "d", "e", "f"];
    for (const id of ids) await synced.brain.write("note", id, `# ${id}\n`);
    await connect(synced);
    await synced.vault.write("image/cup.png", PNG);
    await synced.engine.sync();
    synced.vault.setText("a.md", "# a\n\n![[cup.png]]\n");
    await synced.engine.sync();
    for (const id of ids) await synced.brain.remove("note", id);
    const report = await synced.engine.sync();

    const kept = await synced.engine.resolveDeletes({
      remoteGone: { paths: report.decision?.remoteGone ?? [], action: "keep" },
    });

    expect(kept.issues).toEqual([]);
    expect(await stored(synced, "a")).toBe("# a\n\n![](entity://image/cup)\n");
  });
});

describe("the first sync", () => {
  it("copies a differing file aside instead of moving it, so links to it stay", async () => {
    synced = await fresh();
    await synced.brain.write("note", "differs", "# Differs, brain\n");
    synced.vault.setText("differs.md", "# Differs, vault\n");
    const rename = spyOn(synced.vault, "rename");

    await connect(synced);

    expect(rename).not.toHaveBeenCalled();
    expect(synced.vault.text("differs.md")).toBe("# Differs, brain\n");
    expect(synced.vault.text("Conflicts/differs 2026-11-22 09.30.15.md")).toBe(
      "# Differs, vault\n",
    );
  });

  it("is made once, however often the person says yes", async () => {
    synced = await fresh();
    await synced.brain.write("note", "differs", "# Differs, brain\n");
    synced.vault.setText("differs.md", "# Differs, vault\n");
    await synced.engine.sync();

    await synced.engine.applyFirstSync();
    const again = await synced.engine.applyFirstSync();

    expect(again.status).toBe("synced");
    const copies = (await synced.vault.listFiles()).filter((path) =>
      path.startsWith("Conflicts/"),
    );
    expect(copies).toHaveLength(1);
  });
});
