import { afterEach, describe, expect, it } from "bun:test";
import { connect, fresh, type Synced } from "./helpers/setup";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

/**
 * What the brain-side obsidian-vault plugin wrote into brain-data, the
 * plugin writes into the vault from the brain's own description of its
 * types: a template and a fileClass per type, a base per type, and the
 * Settings and Pipeline bases.
 */
describe("templates, fileClasses and bases", () => {
  it("are written into the vault on the first sync, and never synced as files", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");

    const report = await connect(synced);

    const files = await synced.vault.listFiles();
    expect(files).toContain("_obsidian/templates/note.md");
    expect(files).toContain("_obsidian/fileClasses/note.md");
    expect(files).toContain("_obsidian/bases/Notes.base");
    expect(synced.vault.text("_obsidian/templates/note.md")).toContain("---");
    expect(report.localOnly).toEqual([]);
    expect(report.uploaded).toEqual([]);
    expect(synced.vault.templateFolder).toBe("_obsidian/templates");
  });

  it("are not offered in the first sync's plan", async () => {
    synced = await fresh();
    const report = await synced.engine.sync();

    expect(
      [
        ...(report.firstSync?.upload ?? []),
        ...(report.firstSync?.localOnly ?? []).map((file) => file.path),
      ].some((path) => path.startsWith("_obsidian/")),
    ).toBe(false);
  });

  it("keep the brain's templates and fileClasses, and the person's bases", async () => {
    synced = await fresh();
    await connect(synced);
    const template = synced.vault.text("_obsidian/templates/note.md");
    synced.vault.setText("_obsidian/templates/note.md", "edited here\n");
    synced.vault.setText("_obsidian/fileClasses/note.md", "edited here\n");
    synced.vault.setText("_obsidian/bases/Notes.base", "views: []\n");

    await synced.engine.sync();

    expect(synced.vault.text("_obsidian/templates/note.md")).toBe(template);
    expect(synced.vault.text("_obsidian/fileClasses/note.md")).not.toBe(
      "edited here\n",
    );
    expect(synced.vault.text("_obsidian/bases/Notes.base")).toBe("views: []\n");
  });

  it("writes a deleted base again, and nothing on a sync with nothing to write", async () => {
    synced = await fresh();
    await connect(synced);
    await synced.vault.trash("_obsidian/bases/Notes.base");

    await synced.engine.sync();
    expect(await synced.vault.exists("_obsidian/bases/Notes.base")).toBe(true);

    const before = synced.vault.files.get("_obsidian/templates/note.md")?.mtime;
    await synced.engine.sync();
    expect(synced.vault.files.get("_obsidian/templates/note.md")?.mtime).toBe(
      before,
    );
  });

  it("leaves the person's own template folder setting as it is", async () => {
    synced = await fresh();
    synced.vault.templateFolder = "My templates";

    await connect(synced);

    expect(synced.vault.templateFolder).toBe("My templates");
  });
});
