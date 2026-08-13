import { describe, expect, it } from "bun:test";
import {
  consumeInboxChatPrefill,
  withoutInboxChatPrefill,
} from "./inbox-prefill";

const validState = {
  webChatPrefill: {
    version: 1,
    text: "About inbox item: Review the proposal (mail-item/mail-1)",
  },
};

describe("Inbox chat prefill", () => {
  it("consumes the composer handoff exactly once", () => {
    let state: unknown = validState;
    const consume = (): string =>
      consumeInboxChatPrefill(state, () => {
        state = null;
      });

    expect(consume()).toBe(validState.webChatPrefill.text);
    expect(consume()).toBe("");
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

  it("preserves hostile-looking text as inert composer input", () => {
    const text = '<img src=x onerror="window.prefillExecuted=true">';

    expect(
      consumeInboxChatPrefill(
        { webChatPrefill: { version: 1, text } },
        () => {},
      ),
    ).toBe(text);
  });

  it.each([
    null,
    {},
    { webChatPrefill: { version: 2, text: "wrong version" } },
    { webChatPrefill: { version: 1, text: "" } },
    { webChatPrefill: { version: 1, text: "x".repeat(501) } },
    { webChatPrefill: { version: 1, text: "hello", extra: true } },
  ])("ignores malformed handoff state", (state) => {
    let cleared = false;

    expect(
      consumeInboxChatPrefill(state, () => {
        cleared = true;
      }),
    ).toBe("");
    expect(cleared).toBe(false);
  });
});
