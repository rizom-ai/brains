import { describe, expect, it } from "bun:test";
import {
  createInboxChatPrefillState,
  inboxDetailWorkspaceHref,
} from "./operator-launch";

describe("semantic operator launches", () => {
  it("opens Inbox detail through typed query state at a custom CMS mount", () => {
    expect(
      inboxDetailWorkspaceHref(
        "/studio",
        "?sourceId=mail-items&urgency=high",
        "mail-items",
        "mail/1",
      ),
    ).toBe(
      "/studio/workspaces/unified-inbox%3Ainbox?detailItemId=mail%2F1&detailSourceId=mail-items&sourceId=mail-items&urgency=high",
    );
  });

  it("creates only the destination-owned web-chat prefill state", () => {
    expect(
      createInboxChatPrefillState(
        "mail-items",
        "mail-1",
        "Time-sensitive request",
      ),
    ).toEqual({
      webChatPrefill: {
        version: 2,
        text: "Help me understand this Inbox item and decide what to do next.",
        context: {
          sourceId: "mail-items",
          itemId: "mail-1",
          label: "Time-sensitive request",
        },
      },
    });
  });
});
