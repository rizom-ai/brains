import { afterEach, describe, expect, it } from "bun:test";
import type { HttpResponse } from "@brains/vault-sync";
import { connect, fresh, stored, type Synced } from "@brains/vault-sync/test";
import {
  obsidianFiles,
  type TemplatesSetting,
} from "../src/vault-files/vault-files";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

/** Obsidian's Templates setting, as the person or the plugin left it. */
let templates: TemplatesSetting & { folder: string | undefined };

/** A brain and a vault the plugin writes `_obsidian/` into. */
function withObsidianFiles(): Promise<Synced> {
  templates = {
    folder: undefined,
    getTemplateFolder: async (): Promise<string | undefined> =>
      templates.folder,
    setTemplateFolder: async (folder): Promise<void> => {
      templates.folder = folder;
    },
  };
  return fresh({ generated: obsidianFiles(templates) });
}

/**
 * What the brain-side obsidian-vault plugin wrote into brain-data, the
 * plugin writes into the vault from the brain's own description of its
 * types: a template and a fileClass per type, a base per type, and the
 * Settings and Pipeline bases.
 */
describe("templates, fileClasses and bases", () => {
  it("are written into the vault on the first sync, and never synced as files", async () => {
    synced = await withObsidianFiles();
    await synced.brain.write("note", "tea", "# Tea\n");

    const report = await connect(synced);

    const files = await synced.vault.listFiles();
    expect(files).toContain("_obsidian/templates/note.md");
    expect(files).toContain("_obsidian/fileClasses/note.md");
    expect(files).toContain("_obsidian/bases/Notes.base");
    expect(synced.vault.text("_obsidian/templates/note.md")).toContain("---");
    expect(report.localOnly).toEqual([]);
    expect(report.uploaded).toEqual([]);
    expect(templates.folder).toBe("_obsidian/templates");
  });

  it("are not offered in the first sync's plan", async () => {
    synced = await withObsidianFiles();
    const report = await synced.engine.sync();

    expect(
      [
        ...(report.firstSync?.upload ?? []),
        ...(report.firstSync?.localOnly ?? []).map((file) => file.path),
      ].some((path) => path.startsWith("_obsidian/")),
    ).toBe(false);
  });

  it("keep the brain's templates and fileClasses, and the person's bases", async () => {
    synced = await withObsidianFiles();
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
    synced = await withObsidianFiles();
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

  it("are not written for the brain's own types the vault does not sync", async () => {
    synced = await withObsidianFiles();
    await connect(synced);

    const files = await synced.vault.listFiles();
    expect(files.some((path) => path.includes("conflict"))).toBe(false);
    expect(files).not.toContain("_obsidian/bases/Conflicts.base");
  });

  it("still syncs notes when the brain's description cannot be read, and says so", async () => {
    synced = await withObsidianFiles();
    await synced.brain.write("note", "tea", "# Tea\n");
    await connect(synced);
    const reachable = synced.brain.fetch;
    // A proxy answers the description with a web page.
    synced.brain.fetch = async (request): Promise<HttpResponse> =>
      request.url.endsWith("/.brain/vault-shapes.json")
        ? {
            status: 200,
            headers: {},
            body: new TextEncoder().encode("<!doctype html><html></html>"),
          }
        : reachable(request);
    synced.vault.setText("coffee.md", "# Coffee\n");

    const report = await synced.engine.sync();

    expect(report.status).toBe("synced");
    expect(await stored(synced, "coffee")).toBe("# Coffee\n");
  });

  it("still syncs notes when a template cannot be written, and lists why", async () => {
    synced = await withObsidianFiles();
    await connect(synced);
    const vault = synced.vault;
    const write = vault.write.bind(vault);
    vault.write = async (path, bytes): Promise<void> => {
      if (path.startsWith("_obsidian/"))
        throw new Error("Folder already exists.");
      return write(path, bytes);
    };
    await vault.trash("_obsidian/templates/note.md");
    vault.setText("coffee.md", "# Coffee\n");

    const report = await synced.engine.sync();

    expect(report.status).toBe("synced");
    expect(await stored(synced, "coffee")).toBe("# Coffee\n");
    expect(
      report.issues.some((issue) => issue.path.startsWith("_obsidian")),
    ).toBe(true);
  });

  it("updates a base the person never changed, and leaves one they did", async () => {
    synced = await withObsidianFiles();
    await connect(synced);
    // As an earlier version of the plugin wrote them.
    const stale = "filters:\n  and:\n    - old\n";
    synced.vault.setText("_obsidian/bases/Notes.base", stale);
    synced.vault.setText("_obsidian/bases/Pipeline.base", stale);
    const state = synced.store.current;
    const hash = async (text: string): Promise<string> =>
      [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
        ),
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    // Notes.base is as the plugin last wrote it; Pipeline.base was edited since.
    state.generated["_obsidian/bases/Notes.base"] = await hash(stale);
    state.generated["_obsidian/bases/Pipeline.base"] =
      await hash("something else");

    await synced.engine.sync();

    expect(synced.vault.text("_obsidian/bases/Notes.base")).not.toBe(stale);
    expect(synced.vault.text("_obsidian/bases/Pipeline.base")).toBe(stale);
  });

  it("removes the files of a type the brain no longer has", async () => {
    synced = await withObsidianFiles();
    await connect(synced);
    synced.vault.setText("_obsidian/templates/gone.md", "old template\n");
    synced.store.current.generated["_obsidian/templates/gone.md"] = "recorded";
    synced.vault.setText("_obsidian/templates/mine.md", "my own template\n");

    await synced.engine.sync();

    expect(await synced.vault.exists("_obsidian/templates/gone.md")).toBe(
      false,
    );
    // A template of the person's own was never the plugin's to remove.
    expect(await synced.vault.exists("_obsidian/templates/mine.md")).toBe(true);
  });

  it("sets the template folder once, and not again after the person clears it", async () => {
    synced = await withObsidianFiles();
    await connect(synced);
    expect(templates.folder).toBe("_obsidian/templates");
    templates.folder = undefined;

    await synced.engine.sync();

    expect(templates.folder).toBeUndefined();
  });

  it("leaves the person's own template folder setting as it is", async () => {
    synced = await withObsidianFiles();
    templates.folder = "My templates";

    await connect(synced);

    expect(templates.folder).toBe("My templates");
  });
});
