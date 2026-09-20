/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type {
  ChatHistoryMessage,
  ChatMessageRequest,
  GuestChatHistoryResponse,
} from "@brains/contracts/chat";
import { useGuestGate, type GuestGate } from "./use-guest-gate";
import {
  useGuestHistoryCheck,
  type GuestHistoryCheck,
} from "./use-guest-history-check";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

const locator = `guest-${"a".repeat(64)}`;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/ask" });
  restoreGlobals = installDomGlobals(windowInstance);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function message(
  id: string,
  role: "user" | "assistant",
  content = `${role} text`,
): ChatHistoryMessage {
  return { id, role, content };
}

const submission: ChatMessageRequest = {
  id: locator,
  messages: [{ id: "q", role: "user", parts: [{ type: "text", text: "Q" }] }],
};

interface Harness {
  check: () => GuestHistoryCheck;
  gate: () => GuestGate;
  shown: ChatHistoryMessage[][];
  cleared: number;
}

async function render(options: {
  guestHistory?: () => Promise<GuestChatHistoryResponse>;
  messages?: () => Promise<ChatHistoryMessage[]>;
  pending?: ChatMessageRequest | undefined;
  restored?: string | undefined;
}): Promise<Harness> {
  let latest: GuestHistoryCheck | undefined;
  let latestGate: GuestGate | undefined;
  const shown: ChatHistoryMessage[][] = [];
  let cleared = 0;

  function Probe(): null {
    const gate = useGuestGate();
    const restoredQuestion = useRef<string | undefined>(options.restored);
    latestGate = gate;
    latest = useGuestHistoryCheck({
      client: {
        getGuestHistory: (): Promise<GuestChatHistoryResponse> =>
          options.guestHistory?.() ??
          Promise.reject(new Error("no guest history")),
        getMessages: (): Promise<ChatHistoryMessage[]> =>
          options.messages?.() ?? Promise.resolve([]),
      },
      gate,
      conversationId: locator,
      pending: options.pending,
      clearPending: (): void => {
        cleared += 1;
      },
      showHistory: (history): void => {
        shown.push(history);
      },
      restoredQuestion,
    });
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe));
  });
  await act(async () => {
    await latestGate?.runBoot(async () => undefined);
  });

  return {
    check: (): GuestHistoryCheck => {
      if (!latest) throw new Error("hook did not render");
      return latest;
    },
    gate: (): GuestGate => {
      if (!latestGate) throw new Error("hook did not render");
      return latestGate;
    },
    shown,
    get cleared(): number {
      return cleared;
    },
  };
}

describe("useGuestHistoryCheck", () => {
  it("confirms a submission the brain reports completed", async () => {
    const harness = await render({
      pending: submission,
      guestHistory: () =>
        Promise.resolve({
          messages: [message("q", "user"), message("a", "assistant")],
          submission: { conversationId: locator, state: "completed" },
        }),
    });

    await act(async () => harness.check().check());

    expect(harness.shown.at(-1)?.map((entry) => entry.id)).toEqual(["q", "a"]);
    expect(harness.cleared).toBe(1);
    expect(harness.gate().boxState).toBe("complete");
  });

  it("ends a submission the brain reports failed, without resending", async () => {
    const harness = await render({
      pending: submission,
      guestHistory: () =>
        Promise.resolve({
          messages: [],
          submission: { conversationId: locator, state: "failed" },
        }),
    });

    await act(async () => harness.check().check());

    expect(harness.gate().boxState).toBe("ended");
    expect(harness.cleared).toBe(1);
  });

  it("will not confirm from message count or text alone", async () => {
    // A plausible-looking history, but nothing ties it to this submission:
    // no receipt, and no restored question id to anchor against.
    const harness = await render({
      messages: () =>
        Promise.resolve([message("q", "user"), message("a", "assistant")]),
    });

    await act(async () => harness.check().check());

    expect(harness.shown).toEqual([]);
    expect(harness.cleared).toBe(0);
    expect(harness.gate().boxNotice).toContain(
      "No complete answer is confirmed",
    );
  });

  it("confirms from a stable restored question id followed by an answer", async () => {
    const harness = await render({
      restored: "q",
      messages: () =>
        Promise.resolve([message("q", "user"), message("a", "assistant")]),
    });

    await act(async () => harness.check().check());

    expect(harness.shown.at(-1)?.map((entry) => entry.id)).toEqual(["q", "a"]);
    expect(harness.gate().boxState).toBe("complete");
  });

  it("reports an inconclusive check without resending anything", async () => {
    const harness = await render({
      messages: () => Promise.reject(new Error("History unavailable")),
    });

    await act(async () => harness.check().check());

    expect(harness.shown).toEqual([]);
    expect(harness.cleared).toBe(0);
    expect(harness.gate().boxNotice).toContain("couldn’t check");
  });

  it("says so when a completed request has no answer to show", async () => {
    const harness = await render({
      pending: submission,
      guestHistory: () =>
        Promise.resolve({
          messages: [message("q", "user")],
          submission: { conversationId: locator, state: "completed" },
        }),
    });

    await act(async () => harness.check().check());

    expect(harness.gate().boxNotice).toContain("not available in history");
    expect(harness.cleared).toBe(0);
  });
});
