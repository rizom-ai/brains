import { describe, expect, it } from "bun:test";
import { noticeContent } from "../../../src/lib/channel-pickup/notice";

describe("a notice that announces decisions", () => {
  it("says what was decided, with an Undo", () => {
    expect(
      noticeContent({
        key: "1-3",
        cards: [
          { id: "d-1", kind: "decision", title: "Drop the company field" },
        ],
      }),
    ).toEqual({
      title: "Decision recorded",
      lines: ["Decision: Drop the company field"],
      actions: [{ label: "Undo: Drop the company field", value: "d-1" }],
    });
  });

  it("counts its decisions in its title", () => {
    expect(
      noticeContent({
        key: "1-3",
        cards: [
          { id: "d-1", kind: "decision", title: "Drop the company field" },
          { id: "d-2", kind: "decision", title: "Keep the email field" },
        ],
      }).title,
    ).toBe("Decisions recorded");
  });

  it("is titled by neither when it holds cards and decisions", () => {
    const content = noticeContent({
      key: "1-3",
      cards: [
        { id: "c-1", title: "Send INC the proposal", owner: "Jo" },
        { id: "d-1", kind: "decision", title: "Drop the company field" },
      ],
    });

    expect(content.title).toBe("Picked up from this channel");
    expect(content.lines).toEqual([
      "Send INC the proposal · Jo",
      "Decision: Drop the company field",
    ]);
  });

  it("says which decision a new one superseded, with an Undo only for the new one", () => {
    expect(
      noticeContent({
        key: "4-5",
        cards: [
          { id: "d-2", kind: "decision", title: "Keep the company field" },
          {
            id: "d-1",
            kind: "decision",
            title: "Drop the company field",
            change: "superseded",
          },
        ],
      }),
    ).toEqual({
      title: "Decisions updated",
      lines: [
        "Decision: Keep the company field",
        "Superseded: ~~Drop the company field~~",
      ],
      actions: [{ label: "Undo: Keep the company field", value: "d-2" }],
    });
  });

  it("announces an insight as it does a decision", () => {
    expect(
      noticeContent({
        key: "1-3",
        cards: [
          {
            id: "i-1",
            kind: "insight",
            title: "Freelancers leave at the company field",
          },
        ],
      }),
    ).toEqual({
      title: "Insight recorded",
      lines: ["Insight: Freelancers leave at the company field"],
      actions: [
        {
          label: "Undo: Freelancers leave at the company field",
          value: "i-1",
        },
      ],
    });
  });

  it("is titled by neither when it holds a decision and an insight", () => {
    expect(
      noticeContent({
        key: "1-3",
        cards: [
          { id: "d-1", kind: "decision", title: "Drop the company field" },
          {
            id: "i-1",
            kind: "insight",
            title: "Freelancers leave at the company field",
          },
        ],
      }).title,
    ).toBe("Picked up from this channel");
  });

  it("strikes through a decision someone took back", () => {
    expect(
      noticeContent({
        key: "1-3",
        cards: [
          {
            id: "d-1",
            kind: "decision",
            title: "Drop the company field",
            undo: { outcome: "removed", by: "Jo" },
          },
        ],
      }),
    ).toMatchObject({
      lines: ["~~Drop the company field~~ · removed by Jo"],
      actions: [],
    });
  });

  it("says a decision someone has edited was kept", () => {
    expect(
      noticeContent({
        key: "1-3",
        cards: [
          {
            id: "d-1",
            kind: "decision",
            title: "Drop the company field",
            undo: { outcome: "kept", by: "Jo" },
          },
        ],
      }).lines,
    ).toEqual(["Decision: Drop the company field · kept: edited since"]);
  });
});
