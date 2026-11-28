import { describe, expect, it } from "bun:test";
import {
  ASK_STARTERS,
  askFields,
  askPlaceholder,
  peerPassage,
  replaceSelection,
} from "./ask-panel-model";

const body = "One. The usual reason is privacy. Three.";
const selection = { from: 5, to: 33, text: "The usual reason is privacy." };

// Replace selection changes only the draft, and only what was selected.
describe("replacing the selection", () => {
  it("replaces the selected passage where it still stands", () => {
    expect(replaceSelection(body, selection, "Privacy is the excuse.")).toBe(
      "One. Privacy is the excuse. Three.",
    );
  });

  it("finds the passage once the text before it has changed", () => {
    expect(
      replaceSelection(`Zero. ${body}`, selection, "Privacy is the excuse."),
    ).toBe("Zero. One. Privacy is the excuse. Three.");
  });

  it("refuses when the passage is gone or appears twice", () => {
    expect(replaceSelection("Rewritten.", selection, "x")).toBeNull();
    expect(
      replaceSelection(
        "The usual reason is privacy. The usual reason is privacy.",
        { from: 1, to: 29, text: selection.text },
        "x",
      ),
    ).toBeNull();
  });
});

describe("what an answer may fill", () => {
  const descriptors = [
    { name: "title", label: "Title", widget: "string" },
    { name: "excerpt", label: "Excerpt", widget: "text" },
    { name: "status", label: "Status", widget: "select" },
    { name: "token", label: "Token", widget: "string", secret: true as const },
  ];

  it("offers the entry's text fields, its body and the selection", () => {
    expect(askFields(descriptors)).toEqual([
      { name: "title", label: "Title" },
      { name: "excerpt", label: "Excerpt" },
      { name: "body", label: "Body" },
      { name: "selection", label: "Selection" },
    ]);
  });
});

describe("asking a connected brain", () => {
  it("sends the selection, or the post when nothing is selected", () => {
    expect(peerPassage(body, selection)).toBe(selection.text);
    expect(peerPassage(body, null)).toBe(body);
    expect(peerPassage("x".repeat(9_000), null)).toHaveLength(8_000);
  });
});

describe("the composer", () => {
  it("says who is asked and about what", () => {
    expect(
      askPlaceholder({ who: null, selected: false, typeLabel: "post" }),
    ).toBe("Ask about this post…");
    expect(
      askPlaceholder({ who: "City Pulse", selected: true, typeLabel: "post" }),
    ).toBe("Ask City Pulse about the selection…");
  });

  it("keeps the rewrite bar's presets as starters", () => {
    expect(ASK_STARTERS.map((starter) => starter.label)).toEqual([
      "Review",
      "Fact-check",
      "Related",
      "Rewrite",
    ]);
  });
});
