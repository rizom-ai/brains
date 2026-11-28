import { afterEach, describe, expect, it } from "bun:test";
import { connect, fresh, type Synced } from "./helpers/setup";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

async function withTea(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
  await connect(made);
  return made;
}

/**
 * What each file in the vault is to the brain, for a mark beside its name:
 * in step, waiting to go up, kept in the vault only, or in conflict.
 */
describe("the mark of a file", () => {
  it("is in step for a file the vault and the brain agree on", async () => {
    synced = await withTea();

    expect(await synced.engine.fileMarks()).toEqual({ "tea.md": "synced" });
  });

  it("is waiting for a file changed or made since the last sync", async () => {
    synced = await withTea();
    synced.vault.setText("tea.md", "# Tea\n\nThree minutes.\n");
    synced.vault.setText("coffee.md", "# Coffee\n");

    expect(await synced.engine.fileMarks()).toEqual({
      "coffee.md": "waiting",
      "tea.md": "waiting",
    });

    await synced.engine.sync();

    expect(await synced.engine.fileMarks()).toEqual({
      "coffee.md": "synced",
      "tea.md": "synced",
    });
  });

  it("is local for a file the brain has no place for", async () => {
    synced = await withTea();
    synced.vault.setText("Projects/idea.md", "# Idea\n");
    synced.vault.setText("drawing.canvas", "{}");

    const marks = await synced.engine.fileMarks();

    expect(marks["Projects/idea.md"]).toBe("local");
    expect(marks["drawing.canvas"]).toBe("local");
  });

  it("is in conflict for a note whose other version waits to be compared", async () => {
    synced = await withTea();
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");
    synced.vault.setText("tea.md", "# Tea\n\nFrom Obsidian.\n");
    await synced.engine.sync();

    const marks = await synced.engine.fileMarks();

    expect(marks["tea.md"]).toBe("conflict");
    // The copy is the plugin's own file: it has no mark.
    expect(Object.keys(marks)).toEqual(["tea.md"]);
  });

  it("has none for the plugin's own files and Obsidian's", async () => {
    synced = await withTea();
    synced.vault.setText("_obsidian/templates/note.md", "x");
    synced.vault.setText(".obsidian/app.json", "{}");

    expect(Object.keys(await synced.engine.fileMarks())).toEqual(["tea.md"]);
  });

  it("is waiting for every file before the first sync is made", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");
    synced.vault.setText("coffee.md", "# Coffee\n");
    await synced.engine.sync();

    expect(await synced.engine.fileMarks()).toEqual({ "coffee.md": "waiting" });
  });

  it("reads no file to tell", async () => {
    synced = await withTea();
    const read = synced.vault.read.bind(synced.vault);
    let reads = 0;
    synced.vault.read = async (path): Promise<Uint8Array> => {
      reads += 1;
      return read(path);
    };

    await synced.engine.fileMarks();

    expect(reads).toBe(0);
  });
});
