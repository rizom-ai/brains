import { afterEach, describe, expect, it } from "bun:test";
import { connect, fresh, stored, type Synced } from "./helpers/setup";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

async function withTea(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
  await connect(made);
  return made;
}

/** Phase 6: renaming a note in Obsidian renames it in the brain. */
describe("renames", () => {
  it("renames the note in the brain, keeping it the same entry", async () => {
    synced = await withTea();
    const before = await synced.brain.get("note", "tea");
    await synced.vault.rename("tea.md", "green-tea.md");
    await synced.engine.noteRenamed("tea.md", "green-tea.md");

    const report = await synced.engine.sync();

    expect(report.uploaded).toEqual([]);
    expect(report.notices).toEqual([]);
    expect(await synced.brain.get("note", "tea")).toBeNull();
    expect(await stored(synced, "green-tea")).toBe("# Tea\n\nSteep it.\n");
    const after = await synced.brain.get("note", "green-tea");
    expect(after?.created).toBe(before?.created);
  });

  it("replays renames made offline in order", async () => {
    synced = await withTea();
    synced.brain.online = false;
    await synced.vault.rename("tea.md", "green-tea.md");
    await synced.engine.noteRenamed("tea.md", "green-tea.md");
    await synced.vault.rename("green-tea.md", "sencha.md");
    await synced.engine.noteRenamed("green-tea.md", "sencha.md");
    expect((await synced.engine.sync()).status).toBe("offline");
    synced.brain.online = true;

    await synced.engine.sync();

    expect(await synced.brain.get("note", "tea")).toBeNull();
    expect(await synced.brain.get("note", "green-tea")).toBeNull();
    expect(await stored(synced, "sencha")).toBe("# Tea\n\nSteep it.\n");
  });

  it("undoes a rename onto a name another note has, and says so", async () => {
    synced = await withTea();
    await synced.brain.write("note", "coffee", "# Coffee\n");
    await synced.engine.sync();
    // Obsidian refuses a rename onto an existing file; the brain's note
    // arrived after the rename.
    await synced.vault.rename("tea.md", "water.md");
    await synced.engine.noteRenamed("tea.md", "water.md");
    await synced.brain.write("note", "water", "# Water\n");

    const report = await synced.engine.sync();

    expect(report.notices).toEqual([
      expect.objectContaining({
        kind: "rename-undone",
        from: "tea.md",
        to: "water.md",
      }),
    ]);
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nSteep it.\n");
    expect(synced.vault.text("water.md")).toBe("# Water\n");
    expect(await stored(synced, "tea")).toBe("# Tea\n\nSteep it.\n");
  });

  it("undoes a move into a folder the brain has no place for", async () => {
    synced = await withTea();
    await synced.vault.rename("tea.md", "Projects/tea.md");
    await synced.engine.noteRenamed("tea.md", "Projects/tea.md");

    const report = await synced.engine.sync();

    expect(report.notices[0]).toEqual(
      expect.objectContaining({ kind: "rename-undone" }),
    );
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nSteep it.\n");
    expect(await synced.vault.exists("Projects/tea.md")).toBe(false);
    expect(await stored(synced, "tea")).toBe("# Tea\n\nSteep it.\n");
  });
});

/** Phase 7: other entry types and images. */
describe("images", () => {
  it("uploads an image put in image/, and shows a note's embed of it as the brain's reference", async () => {
    synced = await withTea();
    await synced.vault.write("image/cup.png", PNG);
    synced.vault.setText("tea.md", "# Tea\n\n![[cup.png]]\n");

    const report = await synced.engine.sync();

    expect(report.issues).toEqual([]);
    expect(report.uploaded).toEqual(["image/cup.png", "tea.md"]);
    expect(await synced.brain.get("image", "cup")).not.toBeNull();
    expect(await stored(synced, "tea")).toBe(
      "# Tea\n\n![](entity://image/cup)\n",
    );
    // The vault keeps the person's own embed: nothing to sync afterwards.
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\n![[cup.png]]\n");
    const next = await synced.engine.sync();
    expect(next.uploaded).toEqual([]);
    expect(next.downloaded).toEqual([]);
  });

  it("downloads an image and turns the brain's reference into a link to its file", async () => {
    synced = await withTea();
    await synced.vault.write("image/cup.png", PNG);
    await synced.engine.sync();
    const other = synced.device();
    await synced.brain.write(
      "note",
      "tea",
      "# Tea\n\n![A cup](entity://image/cup)\n",
    );

    await connect(other);

    expect(other.vault.files.get("image/cup.png")?.bytes).toEqual(PNG);
    expect(other.vault.text("tea.md")).toBe(
      "# Tea\n\n![A cup](image/cup.png)\n",
    );
    const next = await other.engine.sync();
    expect(next.uploaded).toEqual([]);
    expect(next.downloaded).toEqual([]);
  });

  it("marks a note that embeds an image from outside image/", async () => {
    synced = await withTea();
    await synced.vault.write("attachments/cup.png", PNG);
    synced.vault.setText("tea.md", "# Tea\n\n![](attachments/cup.png)\n");

    const report = await synced.engine.sync();

    expect(report.issues).toEqual([
      expect.objectContaining({ path: "tea.md" }),
    ]);
    expect(report.localOnly.map((file) => file.path)).toContain(
      "attachments/cup.png",
    );
    expect(await stored(synced, "tea")).toBe(
      "# Tea\n\n![](attachments/cup.png)\n",
    );
  });
});
