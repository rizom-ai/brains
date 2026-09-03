import { describe, expect, it } from "bun:test";
import type { ResponseRenderDirective } from "@brains/sdk/interfaces";
import {
  formatApprovalResultText,
  renderTerminalAnswer,
  resolveApprovalIndexSugar,
} from "../src/render";

/**
 * What the terminal still owns after the conversion.
 *
 * Tracking approvals, routing a "yes" back to one, and deciding what an
 * answer is made of are the runtime's, and covered where they live. What is
 * left here is how a terminal reads: one coalesced block, approvals
 * numbered, and the ordinal that numbering makes meaningful.
 */

function approvalCard(
  id: string,
  summary: string,
  preview?: string,
): Extract<ResponseRenderDirective, { kind: "approvals" }>["cards"][number] {
  return {
    kind: "tool-approval",
    id,
    state: "approval-requested",
    toolName: "system_delete",
    summary,
    ...(preview ? { preview } : {}),
  };
}

describe("how a terminal reads an answer", () => {
  it("joins text and cards into one block", () => {
    const rendered = renderTerminalAnswer([
      { kind: "text", text: "Here is what I found." },
      {
        kind: "supplemental",
        card: {
          kind: "sources",
          id: "sources-1",
          title: "Retrieved context",
          sources: [
            {
              id: "cite-1",
              title: "TypeScript notes",
              source: "note",
              url: "https://example.test/notes/ts",
            },
          ],
        },
      },
    ]);

    expect(rendered).toContain("Here is what I found.");
    expect(rendered).toContain("Sources: Retrieved context");
    // The terminal shows URLs as-is; permission filtering happened upstream.
    expect(rendered).toContain(
      "TypeScript notes — https://example.test/notes/ts",
    );
  });

  it("spells out the single reply that resolves one approval", () => {
    const rendered = renderTerminalAnswer([
      { kind: "text", text: "This will delete 3 notes." },
      {
        kind: "approvals",
        cards: [approvalCard("appr-1", "Delete 3 notes", "notes/a, notes/b")],
        confirmations: [
          {
            id: "appr-1",
            toolName: "system_delete",
            summary: "Delete 3 notes",
            args: {},
          },
        ],
      },
    ]);

    expect(rendered).toContain("notes/a, notes/b");
    expect(rendered).toContain("reply with **yes**");
    // One approval needs no ordinal, so it is not offered one.
    expect(rendered).not.toContain("yes 1");
  });

  it("numbers several approvals, which is what makes an ordinal mean something", () => {
    const rendered = renderTerminalAnswer([
      { kind: "text", text: "Two things need approval." },
      {
        kind: "approvals",
        cards: [
          approvalCard("appr-1", "Delete 3 notes"),
          approvalCard("appr-2", "Publish the site"),
        ],
        confirmations: [
          {
            id: "appr-1",
            toolName: "system_delete",
            summary: "Delete 3 notes",
            args: {},
          },
          {
            id: "appr-2",
            toolName: "site_publish",
            summary: "Publish the site",
            args: {},
          },
        ],
      },
    ]);

    expect(rendered).toContain("1. Delete 3 notes");
    expect(rendered).toContain("2. Publish the site");
    expect(rendered).toContain("**yes 1**");
  });

  it("treats a bare approval-requested card as an approval", () => {
    // The runtime only emits the approvals directive when the response
    // carries pending confirmations; a card on its own still needs asking
    // about, so it is gathered from the supplemental stream too.
    const rendered = renderTerminalAnswer([
      { kind: "text", text: "Ready?" },
      { kind: "supplemental", card: approvalCard("appr-9", "Do the thing") },
    ]);

    expect(rendered).toContain("reply with **yes**");
  });
});

describe("the ordinal a terminal accepts back", () => {
  it("lowers an index to the approval it printed", () => {
    expect(resolveApprovalIndexSugar("yes 2", ["appr-1", "appr-2"])).toBe(
      "yes appr-2",
    );
    expect(resolveApprovalIndexSugar("no #1", ["appr-1", "appr-2"])).toBe(
      "no appr-1",
    );
  });

  it("leaves a message alone when the index names nothing", () => {
    // Out of range, and no index at all: both fall through to the runtime's
    // grammar, which answers with its own notice.
    expect(resolveApprovalIndexSugar("yes 9", ["appr-1"])).toBe("yes 9");
    expect(resolveApprovalIndexSugar("yes", ["appr-1"])).toBe("yes");
  });
});

describe("how a resolved approval reads", () => {
  it("marks the outcome", () => {
    expect(
      formatApprovalResultText("done", [
        {
          kind: "tool-approval",
          id: "appr-1",
          state: "output-available",
          toolName: "system_delete",
          summary: "Deleted 3 notes",
        },
      ]),
    ).toBe("✓ Deleted 3 notes");
  });

  it("keeps the text when nothing was resolved", () => {
    expect(formatApprovalResultText("just talking", undefined)).toBe(
      "just talking",
    );
  });
});
