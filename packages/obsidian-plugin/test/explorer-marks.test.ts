import { describe, expect, it } from "bun:test";
import { explorerMarks } from "../src/obsidian/explorer-marks";

/**
 * What the file list shows beside a name. A file in step shows nothing: the
 * marks are for what a person may want to look at.
 */
describe("the marks in the file list", () => {
  it("shows nothing for a file in step", () => {
    expect(explorerMarks({ "tea.md": "synced" }, [])).toEqual({});
  });

  it("shows a file's own mark", () => {
    expect(
      explorerMarks(
        { "tea.md": "waiting", "idea.canvas": "local", "milk.md": "conflict" },
        [],
      ),
    ).toEqual({
      "tea.md": "waiting",
      "idea.canvas": "local",
      "milk.md": "conflict",
    });
  });

  it("shows a file the brain refused as refused, whatever else it is", () => {
    expect(
      explorerMarks({ "tea.md": "waiting", "post/a.md": "synced" }, [
        "tea.md",
        "post/a.md",
      ]),
    ).toEqual({ "tea.md": "refused", post: "refused", "post/a.md": "refused" });
  });

  it("shows on a folder the most pressing mark inside it", () => {
    const marks = explorerMarks(
      {
        "post/a.md": "synced",
        "post/b.md": "waiting",
        "post/drafts/c.md": "conflict",
        "image/x.png": "waiting",
        "link/l.md": "synced",
      },
      [],
    );

    expect(marks["post"]).toBe("conflict");
    expect(marks["post/drafts"]).toBe("conflict");
    expect(marks["image"]).toBe("waiting");
    expect(marks["link"]).toBeUndefined();
  });

  it("does not mark a folder for files that only stay in the vault", () => {
    const marks = explorerMarks(
      { "Projects/idea.md": "local", "Projects/plan.md": "local" },
      [],
    );

    // Each file says so itself; the folder has nothing to do.
    expect(marks["Projects"]).toBeUndefined();
    expect(marks["Projects/idea.md"]).toBe("local");
  });
});
