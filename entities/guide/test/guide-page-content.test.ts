import { describe, expect, it } from "bun:test";
import {
  closingHeading,
  guideRecipeHighlights,
  guideRecipeSchema,
  materialFragments,
} from "../src";
import { entityTypeNote } from "../src/lib/guide-page-content";

describe("guideRecipeHighlights", () => {
  it("lists what the professional recipe brings a writer", () => {
    expect(guideRecipeHighlights("professional")).toEqual([
      "Your own site, with posts and series",
      "A publishing queue with drafts and schedules",
      "Newsletter issues from published posts",
      "LinkedIn drafts when you ask for them",
    ]);
  });

  it("has lines for every recipe a guide can name", () => {
    expect(
      guideRecipeSchema.options.map(
        (recipe) => guideRecipeHighlights(recipe).length > 0,
      ),
    ).toEqual(guideRecipeSchema.options.map(() => true));
  });

  it("promises no site for the personal recipe", () => {
    expect(guideRecipeHighlights("personal").join(" ")).not.toMatch(/site/i);
  });
});

describe("materialFragments", () => {
  it("scatters one fragment per place the material lives", () => {
    const fragments = materialFragments([
      {
        from: "Drafts and fragments",
        where: "Google Docs, Word, a notes app",
        becomes: "note",
        how: "Download",
      },
      {
        from: "Essays that belong together",
        where: "A run you wrote over months",
        becomes: "series",
        how: "Ask",
      },
    ]);

    expect(fragments.map(({ label, text }) => [label, text])).toEqual([
      ["Drafts and fragments", "Google Docs"],
      ["Drafts and fragments", "Word"],
      ["Drafts and fragments", "a notes app"],
      ["Essays that belong together", "A run you wrote over months"],
    ]);
  });

  it("places fragments on a ring around the opening copy", () => {
    const fragments = materialFragments([
      {
        from: "Drafts",
        where: "a, b, c, d, e, f",
        becomes: "note",
        how: "Download",
      },
    ]);

    expect(
      fragments.every(({ x, y }) => Math.hypot(x, y) > 0.5 && Math.abs(x) <= 1),
    ).toBe(true);
    // Fragments near the vertical axis keep clear of the title.
    expect(
      fragments
        .filter(({ x }) => Math.abs(x) < 0.74)
        .every(({ y }) => Math.abs(y) >= 0.8),
    ).toBe(true);
    // On a phone every fragment keeps clear of the title.
    expect(fragments.every(({ narrowY }) => Math.abs(narrowY) >= 0.8)).toBe(
      true,
    );
  });

  it("returns nothing for a guide without material", () => {
    expect(materialFragments([])).toEqual([]);
  });
});

describe("closingHeading", () => {
  it("asks whether the reader is someone else", () => {
    expect(closingHeading("The writer")).toBe("Not quite a writer?");
    expect(closingHeading("The operator")).toBe("Not quite an operator?");
  });

  it("falls back for a persona that names no kind of user", () => {
    expect(closingHeading("Running your own brain")).toBe(
      "Looking for another way in?",
    );
  });
});

describe("entityTypeNote", () => {
  it("glosses every type the moving-in guides map material to", () => {
    const mapped = [
      "note",
      "post",
      "series",
      "link",
      "deck",
      "doc",
      "anchor-profile",
      "project",
      "action-item",
      "image",
    ];

    expect(mapped.filter((type) => entityTypeNote(type) === undefined)).toEqual(
      [],
    );
  });
});
