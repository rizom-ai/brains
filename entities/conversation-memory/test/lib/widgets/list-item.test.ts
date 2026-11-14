import { describe, expect, it } from "bun:test";
import { listBlockItems, listItemOf } from "../../../src/lib/widgets/list-item";

describe("a memory record as a widget list item", () => {
  it("is named by its heading and described by its first sentence", () => {
    expect(
      listItemOf(
        {
          id: "d1",
          content:
            "---\nstatus: active\n---\n# Ship on Friday\n\nWe agreed to ship. More follows.",
        },
        ["#general", ""],
      ),
    ).toEqual({
      id: "d1",
      name: "Ship on Friday",
      description: "We agreed to ship.",
      meta: ["#general"],
    });
  });

  it("falls back to its id, and states no description it does not have", () => {
    expect(listItemOf({ id: "d2", content: "" }, [])).toEqual({
      id: "d2",
      name: "d2",
      meta: [],
    });
  });
});

describe("widget list items as a list block's rows", () => {
  it("badges each row with its status, in the tone the widget gives it", () => {
    const status: "blocked" | "open" = "blocked";
    const items = [{ id: "a1", name: "Fix it", meta: ["2d"], status }];
    expect(
      listBlockItems<"blocked" | "open">(items, (given) =>
        given === "blocked" ? "warn" : "neutral",
      ),
    ).toEqual([
      {
        id: "a1",
        title: "Fix it",
        metadata: ["2d"],
        badges: [{ label: "blocked", tone: "warn" }],
      },
    ]);
  });
});
