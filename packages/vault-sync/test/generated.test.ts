import { afterEach, describe, expect, it } from "bun:test";
import { parseState, type GeneratedFile, type GeneratedFiles } from "../src";
import { connect, fresh, type Synced } from "../src/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

/** An editor's files: one per type, and a record of each time they were written. */
function editorFiles(): GeneratedFiles & { firsts: boolean[] } {
  const firsts: boolean[] = [];
  return {
    firsts,
    folder: "_editor",
    files: (shapes) =>
      shapes.map((shape) => ({
        path: `_editor/${shape.entityType}.txt`,
        content: `${shape.entityType}\n`,
        owner: "brain",
      })),
    ownerOf: () => "brain",
    written: async (first): Promise<void> => {
      firsts.push(first);
    },
  };
}

describe("an editor's files for the brain's types", () => {
  it("are written only when the editor asks for them", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");

    const report = await connect(synced);

    expect(await synced.vault.listFiles()).toEqual(["tea.md"]);
    expect(report.issues).toEqual([]);
  });

  it("go into the editor's folder, which is never synced", async () => {
    const generated = editorFiles();
    synced = await fresh({ generated });
    await connect(synced);
    synced.vault.setText("_editor/own.txt", "mine\n");

    const report = await synced.engine.sync();

    expect(synced.vault.text("_editor/note.txt")).toBe("note\n");
    expect(report.uploaded).toEqual([]);
    expect(report.localOnly).toEqual([]);
  });

  it("are told the first time apart from the times after", async () => {
    const generated = editorFiles();
    synced = await fresh({ generated });

    await connect(synced);
    await synced.engine.sync();

    expect(generated.firsts).toEqual([true, false]);
  });

  it("have no mark in the file list", async () => {
    synced = await fresh({ generated: editorFiles() });
    await synced.brain.write("note", "tea", "# Tea\n");
    await connect(synced);

    expect(await synced.engine.fileMarks()).toEqual({ "tea.md": "synced" });
  });
});

describe("an editor's first-time step after writing its files", () => {
  it("is tried again after it failed", async () => {
    const generated = editorFiles();
    const written = generated.written;
    let fails = true;
    generated.written = async (first): Promise<void> => {
      if (fails) throw new Error("the settings file is locked");
      await written?.(first);
    };
    synced = await fresh({ generated });

    const report = await connect(synced);
    fails = false;
    await synced.engine.sync();
    await synced.engine.sync();

    expect(report.issues.map((issue) => issue.path)).toEqual(["_editor"]);
    expect(generated.firsts).toEqual([true, false]);
  });

  it("is not run again in a vault whose state is from before it was kept", async () => {
    const generated = editorFiles();
    synced = await fresh({ generated });
    await connect(synced);
    const { generatedSetUp: _kept, ...before } = synced.store.current;
    synced.store.current = parseState(before);

    await synced.engine.sync();

    expect(generated.firsts).toEqual([true, false]);
  });

  it("is not run again when the brain's types come back after all were gone", async () => {
    const generated = editorFiles();
    const files = generated.files;
    let gone = false;
    generated.files = (shapes): GeneratedFile[] => (gone ? [] : files(shapes));
    synced = await fresh({ generated });
    await connect(synced);

    gone = true;
    await synced.engine.sync();
    gone = false;
    await synced.engine.sync();

    expect(generated.firsts).toEqual([true, false]);
  });
});
