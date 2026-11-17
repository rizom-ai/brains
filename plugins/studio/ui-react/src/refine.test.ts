import { describe, expect, it } from "bun:test";
import type { EntitySummary } from "./api";
import {
  pickedInListOrder,
  pickedLine,
  refineActionLabel,
  refineNotice,
  togglePick,
  type RefineOutcome,
} from "./refine";

const entry = (
  id: string,
  frontmatter: Record<string, unknown> = {},
): EntitySummary => ({
  id,
  entityType: "refined-note",
  frontmatter,
  updated: "2026-11-16T00:00:00.000Z",
});

const outcome: RefineOutcome = {
  sourceType: "note",
  entryLabel: "Note",
  sourceLabel: "Notes",
  count: 3,
  targetType: "refined-note",
  targetLabel: "Refined Note",
  entityId: "dashboard-drop-off",
};

describe("picking entries to refine", () => {
  it("adds an entry that is not picked and drops one that is", () => {
    expect(togglePick([], "a")).toEqual(["a"]);
    expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
  });

  it("names the picked entries in the order the list shows them", () => {
    expect(
      pickedInListOrder(["c", "a"], [entry("a"), entry("b"), entry("c")]),
    ).toEqual(["a", "c"]);
  });

  it("forgets a picked entry the list no longer shows", () => {
    expect(pickedInListOrder(["a", "gone"], [entry("a")])).toEqual(["a"]);
  });

  it("says how many are picked of how many", () => {
    expect(pickedLine(3, 4)).toBe("3 picked of 4");
  });

  it("names the action by what is picked", () => {
    expect(refineActionLabel(1, "Note", "Notes")).toBe("Refine note");
    expect(refineActionLabel(3, "Note", "Notes")).toBe("Refine 3 notes");
    expect(refineActionLabel(2, "FAQ", "FAQs")).toBe("Refine 2 FAQs");
  });
});

describe("what Studio says after a refine was confirmed", () => {
  it("says the brain is writing while the entry is a placeholder", () => {
    expect(
      refineNotice(outcome, "refined-note", [
        entry("dashboard-drop-off", { status: "generating" }),
      ]),
    ).toEqual({
      state: "writing",
      tone: "info",
      text: "Refining 3 notes into one. They are removed once it is saved.",
    });
  });

  it("says so too before the list has shown the entry", () => {
    expect(refineNotice(outcome, "refined-note", [])).toMatchObject({
      state: "writing",
    });
    expect(refineNotice(outcome, "refined-note", null)).toMatchObject({
      state: "writing",
    });
  });

  it("names the refined note once the brain has written it", () => {
    expect(
      refineNotice(outcome, "refined-note", [
        entry("dashboard-drop-off", { title: "Push beats pull" }),
      ]),
    ).toEqual({
      state: "done",
      tone: "success",
      text: "Refined 3 notes into “Push beats pull”. The notes were removed.",
    });
  });

  it("says the entries are kept when the brain could not write it", () => {
    expect(
      refineNotice(outcome, "refined-note", [
        entry("dashboard-drop-off", {
          status: "failed",
          error: "Model unavailable",
        }),
      ]),
    ).toEqual({
      state: "failed",
      tone: "error",
      text: "The brain could not write the refined note: Model unavailable. Your 3 notes are still in Notes.",
    });
  });

  it("speaks of one entry as that entry, not as one of a number", () => {
    const one = { ...outcome, count: 1 };

    expect(refineNotice(one, "refined-note", [])?.text).toBe(
      "Refining the note. It is removed once the refined note is saved.",
    );
    expect(
      refineNotice(one, "refined-note", [
        entry("dashboard-drop-off", { title: "Push beats pull" }),
      ])?.text,
    ).toBe("Refined the note into “Push beats pull”. The note was removed.");
    expect(
      refineNotice(one, "refined-note", [
        entry("dashboard-drop-off", { status: "failed" }),
      ])?.text,
    ).toBe(
      "The brain could not write the refined note. Your note is still in Notes.",
    );
  });

  it("says nothing in any other collection", () => {
    expect(refineNotice(outcome, "note", [])).toBeNull();
    expect(refineNotice(null, "refined-note", [])).toBeNull();
  });
});
