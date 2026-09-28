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
  render: (input: {
    resetKey: unknown;
    contentKey: unknown;
    paused?: boolean;
  }) => Promise<void>;
  scrollTo: (scrollTop: number) => Promise<void>;
}

function createHarness(): Harness {
  let latest: FollowTail | undefined;
  function Probe(props: {
    resetKey: unknown;
    contentKey: unknown;
    paused?: boolean;
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

  it("shows the region from a chosen element and stops following", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    const region = harness.element();
    region.scrollTop = 1000;
    const target = document.createElement("div");
    region.append(target);
    region.getBoundingClientRect = (): DOMRect =>
      new windowInstance.DOMRect(0, 100, 300, 200);
    // 250px below the region's top while it is scrolled 1000px down.
    target.getBoundingClientRect = (): DOMRect =>
      new windowInstance.DOMRect(0, 350, 300, 40);

    await act(async () => harness.tail().showFrom(target));

    expect(region.scrollTop).toBe(1250);
    expect(harness.tail().awayFromLatest).toBe(true);
    await harness.render({ resetKey: "a", contentKey: 2 });
    expect(region.scrollTop).toBe(1250);
  });

  it("shows the chosen element below a covered top (the region's scroll padding)", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    const region = harness.element();
    region.style.scrollPaddingTop = "300px";
    region.scrollTop = 1000;
    const target = document.createElement("div");
    region.append(target);
    region.getBoundingClientRect = (): DOMRect =>
      new windowInstance.DOMRect(0, 100, 300, 200);
    target.getBoundingClientRect = (): DOMRect =>
      new windowInstance.DOMRect(0, 350, 300, 40);

    await act(async () => harness.tail().showFrom(target));

    // Something covers the region's top 300px, so the element sits below it.
    expect(region.scrollTop).toBe(950);
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

  it("resumes following without moving until the next content arrives", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    await harness.scrollTo(100);

    await act(async () => harness.tail().follow());

    expect(harness.tail().awayFromLatest).toBe(false);
    expect(harness.element().scrollTop).toBe(100);
    await harness.render({ resetKey: "a", contentKey: 2 });
    expect(harness.element().scrollTop).toBe(1000);
  });

  it("holds still while paused and follows again once resumed", async () => {
    const harness = createHarness();
    await harness.render({ resetKey: "a", contentKey: 1 });
    await harness.render({ resetKey: "a", contentKey: 1, paused: true });
    harness.element().scrollTop = 0;

    await harness.scrollTo(0);
    await harness.render({ resetKey: "a", contentKey: 2, paused: true });

    expect(harness.element().scrollTop).toBe(0);
    expect(harness.tail().awayFromLatest).toBe(false);
    await harness.render({ resetKey: "a", contentKey: 3 });
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
