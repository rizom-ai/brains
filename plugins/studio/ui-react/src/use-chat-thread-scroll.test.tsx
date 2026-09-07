/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useChatThreadScroll,
  type ChatThreadScroll,
} from "./use-chat-thread-scroll";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/chat" });
  restoreGlobals = installDomGlobals(windowInstance, {
    Event: windowInstance.Event,
    ResizeObserver: windowInstance.ResizeObserver,
  });
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

interface Harness {
  scroll: () => ChatThreadScroll;
  element: () => HTMLElement;
  render: (input: {
    sessionId: string | null;
    contentKey: unknown;
  }) => Promise<void>;
  scrollTo: (scrollTop: number) => Promise<void>;
}

function createHarness(): Harness {
  let latest: ChatThreadScroll | undefined;
  function Probe(props: {
    sessionId: string | null;
    contentKey: unknown;
  }): ReactElement {
    latest = useChatThreadScroll(props);
    return createElement(
      "div",
      { ref: latest.threadScrollRef, onScroll: latest.onThreadScroll },
      createElement("div", null, "thread"),
    );
  }
  const scroll = (): ChatThreadScroll => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  const element = (): HTMLElement => {
    const node = scroll().threadScrollRef.current;
    if (!node) throw new Error("thread element was never attached");
    return node;
  };
  return {
    scroll,
    element,
    render: async (input): Promise<void> => {
      await act(async () => {
        root.render(createElement(Probe, input));
      });
      // happy-dom reports zero for every layout box, so the thread's geometry
      // is declared: 1000px of content inside a 200px viewport.
      const node = scroll().threadScrollRef.current;
      if (node?.scrollHeight === 0) {
        Object.defineProperty(node, "scrollHeight", {
          value: 1000,
          configurable: true,
        });
        Object.defineProperty(node, "clientHeight", {
          value: 200,
          configurable: true,
        });
      }
    },
    scrollTo: async (scrollTop): Promise<void> => {
      const node = element();
      node.scrollTop = scrollTop;
      await act(async () => {
        node.dispatchEvent(new Event("scroll", { bubbles: false }));
      });
    },
  };
}

describe("useChatThreadScroll", () => {
  it("pins the thread to the bottom when new content arrives", async () => {
    const harness = createHarness();
    await harness.render({ sessionId: "a", contentKey: 1 });
    harness.element().scrollTop = 0;

    await harness.render({ sessionId: "a", contentKey: 2 });

    expect(harness.element().scrollTop).toBe(1000);
    expect(harness.scroll().showJumpToLatest).toBe(false);
  });

  it("stops following once the reader scrolls away from the bottom", async () => {
    const harness = createHarness();
    await harness.render({ sessionId: "a", contentKey: 1 });

    await harness.scrollTo(100);

    expect(harness.scroll().showJumpToLatest).toBe(true);

    await harness.render({ sessionId: "a", contentKey: 2 });
    expect(harness.element().scrollTop).toBe(100);
  });

  it("resumes following when the reader returns near the bottom", async () => {
    const harness = createHarness();
    await harness.render({ sessionId: "a", contentKey: 1 });
    await harness.scrollTo(100);
    expect(harness.scroll().showJumpToLatest).toBe(true);

    // Within 48px of the end counts as the bottom.
    await harness.scrollTo(770);

    expect(harness.scroll().showJumpToLatest).toBe(false);
    await harness.render({ sessionId: "a", contentKey: 2 });
    expect(harness.element().scrollTop).toBe(1000);
  });

  it("restores following when the conversation changes", async () => {
    const harness = createHarness();
    await harness.render({ sessionId: "a", contentKey: 1 });
    await harness.scrollTo(100);
    expect(harness.scroll().showJumpToLatest).toBe(true);

    await harness.render({ sessionId: "b", contentKey: 1 });

    expect(harness.scroll().showJumpToLatest).toBe(false);
    await harness.render({ sessionId: "b", contentKey: 2 });
    expect(harness.element().scrollTop).toBe(1000);
  });

  it("jumps to the latest on demand and resumes following", async () => {
    const harness = createHarness();
    await harness.render({ sessionId: "a", contentKey: 1 });
    await harness.scrollTo(100);

    await act(async () => harness.scroll().jumpToLatest());

    expect(harness.element().scrollTop).toBe(1000);
    expect(harness.scroll().showJumpToLatest).toBe(false);
  });
});
