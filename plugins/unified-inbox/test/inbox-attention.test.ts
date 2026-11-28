import { describe, expect, it } from "bun:test";
import { inboxWorkspace } from "../src/operator-studio";
import { inboxWorkspaceQuerySchema } from "../src/schemas";

function data(
  open: number,
  high: number,
): Parameters<NonNullable<typeof inboxWorkspace.attention>>[0]["data"] {
  return {
    query: inboxWorkspaceQuerySchema.parse({}),
    snapshot: {
      summary: { open, high },
      sources: [],
      entries: [],
      errors: [],
      total: open,
      offset: 0,
      limit: 25,
    },
  };
}

// Home lists the inbox only when something is open in it.
describe("the inbox's attention", () => {
  it("says how much is open, and warns when some of it is urgent", () => {
    expect(inboxWorkspace.attention?.({ data: data(3, 1) })).toEqual([
      {
        id: "open",
        title: "3 items in your inbox",
        detail: "1 is marked urgent.",
        severity: "warn",
        action: { label: "Open inbox" },
      },
    ]);
    expect(inboxWorkspace.attention?.({ data: data(1, 0) })).toEqual([
      {
        id: "open",
        title: "1 item in your inbox",
        severity: "info",
        action: { label: "Open inbox" },
      },
    ]);
  });

  it("names nothing when the inbox is clear", () => {
    expect(inboxWorkspace.attention?.({ data: data(0, 0) })).toEqual([]);
  });
});
