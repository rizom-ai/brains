import { describe, expect, it } from "bun:test";
import { capturedNote, titleOf } from "../src/obsidian/capture";

/**
 * Quick capture: a piece of text becomes a note at the top of the vault,
 * where the brain keeps notes, and goes up with the next sync.
 */
describe("the title a captured text gets", () => {
  it("is its first line, without markdown's marks", () => {
    expect(titleOf("# Tea, properly\n\nSteep it.")).toBe("Tea, properly");
    expect(titleOf("- buy a kettle\n- and tea")).toBe("buy a kettle");
    expect(titleOf("> **Steep** it _long_")).toBe("Steep it long");
    expect(titleOf("\n\n  Second thoughts  \nmore")).toBe("Second thoughts");
  });

  it("is cut at a word when the line runs long", () => {
    const title = titleOf(
      "This is a thought that goes on for rather longer than any file name should ever be allowed to go on for",
    );

    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toBe(
      "This is a thought that goes on for rather longer than any",
    );
  });

  it("is a link's own text, not its address", () => {
    expect(titleOf("[A good read](https://example.com/a)")).toBe("A good read");
  });

  it("is nothing for text that says nothing", () => {
    expect(titleOf("   \n\n")).toBe("");
    expect(titleOf("---")).toBe("");
  });
});

describe("the note a captured text becomes", () => {
  const none = (): boolean => false;

  it("is a file at the top of the vault, named by its title", () => {
    expect(capturedNote("Steep it for three minutes.", "Tea", none)).toEqual({
      path: "Tea.md",
      content: "Steep it for three minutes.\n",
    });
  });

  it("keeps the text as it was written", () => {
    const text = "# Tea\n\n- green\n- black\n";

    expect(capturedNote(text, "Tea", none)?.content).toBe(text);
  });

  it("leaves out of the name what a file name cannot hold", () => {
    expect(
      capturedNote("x", 'What: is "tea"? A/B <test> #1 [x] ^y |z*', none)?.path,
    ).toBe("What is tea A B test 1 x y z.md");
    expect(capturedNote("x", "  .hidden.  ", none)?.path).toBe("hidden.md");
  });

  it("takes the next free name when one is taken", () => {
    const taken = new Set(["Tea.md", "Tea 2.md"]);

    expect(capturedNote("x", "Tea", (path) => taken.has(path))?.path).toBe(
      "Tea 3.md",
    );
  });

  it("is not made of nothing, or without a name", () => {
    expect(capturedNote("   ", "Tea", none)).toBeUndefined();
    expect(capturedNote("text", " /?* ", none)).toBeUndefined();
  });
});
