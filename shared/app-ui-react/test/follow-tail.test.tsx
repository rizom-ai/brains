/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFollowTail, type FollowTail } from "../src";

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
  tail: () => FollowTail;
  element: () => HTMLElement;
  render: (input: { resetKey: unknown; contentKey: unknown }) => Promise<void>;
  scrollTo: (scrollTop: number) => Promise<void>;
}

function createHarness(): Harness {
  let latest: FollowTail | undefined;
  function Probe(props: {
    resetKey: unknown;
    contentKey: unknown;
  }): ReactElement {
    latest = useFollowTail(props);
    return createElement(
      "div",
      { ref: latest.ref, onScroll: latest.onScroll },
      createElement("div", null, "thread"),
    );
  }
  const tail = (): FollowTail => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  const element = (): HTMLElement => {
    const node = tail().ref.current;
    if (!node) throw new Error("scroll element was never attached");
    return node;
  };
  return {
    tail,
    element,
    render: async (input): Promise<void> => {
      await act(async () => {
        root.render(createElement(Probe, input));
      });
      // happy-dom reports zero for every layout box, so the region's geometry
      // is declared: 1000px of content inside a 200px viewport.
      const node = tail().ref.current;
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

describe("useFollowTail", () => {
  it("pins the region to the bottom when new content arrives", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    harness.element().scrollTop = 0;

    await harness.render({ resetKey: "a", contentKey: 2 });

    expect(harness.element().scrollTop).toBe(1000);
    expect(harness.tail().awayFromLatest).toBe(false);
  });

  it("stops following once the reader scrolls away from the bottom", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });

    await harness.scrollTo(100);

    expect(harness.tail().awayFromLatest).toBe(true);

    await harness.render({ resetKey: "a", contentKey: 2 });
    expect(harness.element().scrollTop).toBe(100);
  });

  it("resumes following when the reader returns near the bottom", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    await harness.scrollTo(100);
    expect(harness.tail().awayFromLatest).toBe(true);

    // Within 48px of the end counts as the bottom.
    await harness.scrollTo(770);

    expect(harness.tail().awayFromLatest).toBe(false);
    await harness.render({ resetKey: "a", contentKey: 2 });
    expect(harness.element().scrollTop).toBe(1000);
  });

  it("restores following when the reset key changes", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    await harness.scrollTo(100);
    expect(harness.tail().awayFromLatest).toBe(true);

    await harness.render({ resetKey: "b", contentKey: 1 });

    expect(harness.tail().awayFromLatest).toBe(false);
    await harness.render({ resetKey: "b", contentKey: 2 });
    expect(harness.element().scrollTop).toBe(1000);
  });

  it("jumps to the latest on demand and resumes following", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    await harness.scrollTo(100);

    await act(async () => harness.tail().jumpToLatest());

    expect(harness.element().scrollTop).toBe(1000);
    expect(harness.tail().awayFromLatest).toBe(false);
  });
});
