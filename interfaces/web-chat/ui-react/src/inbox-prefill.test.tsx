/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import {
  consumeInboxChatPrefill,
  withoutInboxChatPrefill,
} from "./inbox-prefill";

const validState = {
  webChatPrefill: {
    version: 2,
    text: "Help me understand this Inbox item and decide what to do next.",
    context: {
      sourceId: "mail-items",
      itemId: "mail-1",
      label: "Review the proposal",
    },
  },
};

describe("Inbox chat prefill", () => {
  it("consumes the composer and source handoff exactly once", () => {
    let state: unknown = validState;
    const consume = (): ReturnType<typeof consumeInboxChatPrefill> =>
      consumeInboxChatPrefill(state, () => {
        state = null;
      });

    expect(consume()).toEqual({
      text: validState.webChatPrefill.text,
      context: validState.webChatPrefill.context,
    });
    expect(consume()).toBeUndefined();
  });

  it("removes only the consumed handoff from router history state", () => {
    expect(
      withoutInboxChatPrefill({
        ...validState,
        __TSR_index: 2,
        __TSR_key: "router-key",
      }),
    ).toEqual({ __TSR_index: 2, __TSR_key: "router-key" });
  });

  it("preserves hostile-looking labels as inert UI text", () => {
    const label = '<img src=x onerror="window.prefillExecuted=true">';

    expect(
      consumeInboxChatPrefill(
        {
          webChatPrefill: {
            ...validState.webChatPrefill,
            context: { ...validState.webChatPrefill.context, label },
          },
        },
        () => {},
      ),
    ).toEqual({
      text: validState.webChatPrefill.text,
      context: { ...validState.webChatPrefill.context, label },
    });
  });

  it.each([
    null,
    {},
    { webChatPrefill: { ...validState.webChatPrefill, version: 1 } },
    { webChatPrefill: { ...validState.webChatPrefill, text: "" } },
    {
      webChatPrefill: {
        ...validState.webChatPrefill,
        text: "x".repeat(501),
      },
    },
    {
      webChatPrefill: {
        ...validState.webChatPrefill,
        context: { ...validState.webChatPrefill.context, sourceId: "INVALID" },
      },
    },
    { webChatPrefill: { ...validState.webChatPrefill, extra: true } },
  ])("ignores malformed handoff state", (state) => {
    let cleared = false;

    expect(
      consumeInboxChatPrefill(state, () => {
        cleared = true;
      }),
    ).toBeUndefined();
    expect(cleared).toBe(false);
  });
});
