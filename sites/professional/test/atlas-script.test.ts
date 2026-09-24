import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import { HOMEPAGE_ATLAS_SCRIPT } from "../src/templates/homepage-atlas-script";

let window: Window;
let restoreGlobals: RestoreGlobals;
let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void>;

const media: Record<string, boolean> = {};

function setup(options: { touch: boolean; still?: boolean }): void {
  media["(hover: none)"] = options.touch;
  media["(prefers-reduced-motion: reduce)"] = options.still ?? false;
  window.document.body.innerHTML = `
    <section data-atlas>
      <a class="contact" href="/contact">Let’s talk</a>
      <div data-atlas-field>
        <svg data-atlas-terrain></svg>
        <ul>
          <li data-atlas-mark><a id="first" href="/essays/first"><span id="first-card" data-atlas-tip>First</span></a></li>
          <li data-atlas-mark><a id="second" href="/essays/second"><span>Second</span></a></li>
        </ul>
      </div>
    </section>
    <p id="outside">Elsewhere</p>`;
  // Marks sit 40px apart on a phone-sized map; each is a 26px hit target.
  window.document
    .querySelectorAll("[data-atlas-mark]")
    .forEach((mark, index) => {
      Object.assign(mark, {
        getBoundingClientRect: () => rect(100 + index * 40, 100),
      });
    });
  eval(HOMEPAGE_ATLAS_SCRIPT);
}

function rect(
  x: number,
  y: number,
): { left: number; top: number; width: number; height: number } {
  return { left: x - 13, top: y - 13, width: 26, height: 26 };
}

/** Dispatches a click (at the target mark's centre unless given) and reports whether the page let it navigate. */
function tap(selector: string, at?: { x: number; y: number }): boolean {
  const target = window.document.querySelector(selector);
  if (!target) throw new Error(`missing ${selector}`);
  const mark = target.closest("[data-atlas-mark]");
  const box = mark?.getBoundingClientRect();
  const point =
    at ??
    (box
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      : { x: 0, y: 0 });
  return target.dispatchEvent(
    new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
    }),
  );
}

function openMarks(): string[] {
  return Array.from(
    window.document.querySelectorAll("[data-atlas-mark][data-open] a"),
  ).map((link) => link.id);
}

beforeEach(() => {
  window = new Window({ url: "https://yeehaa.test/" });
  observed = [];
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: media[query] ?? false,
      addEventListener: (): void => undefined,
    }),
  });
  class Observer {
    constructor(
      callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    ) {
      observed.push(callback);
    }
    observe(): void {}
  }
  restoreGlobals = installGlobals({
    window,
    document: window.document,
    IntersectionObserver: Observer,
  });
});

afterEach(() => {
  window.close();
  restoreGlobals();
});

describe("atlas on touch screens", () => {
  it("shows a mark's title on the first tap and follows it on the second", () => {
    setup({ touch: true });
    expect(tap("#first")).toBe(false);
    expect(openMarks()).toEqual(["first"]);
    expect(tap("#first")).toBe(true);
  });

  it("resolves a tap on an overlapping neighbour to the nearest mark", () => {
    setup({ touch: true });
    // The second mark's hit target sits on top, but the finger is nearer the first.
    expect(tap("#second", { x: 112, y: 100 })).toBe(false);
    expect(openMarks()).toEqual(["first"]);
  });

  it("follows the open mark when tapped near it again, even through a neighbour", () => {
    setup({ touch: true });
    tap("#first");
    const assigned: string[] = [];
    Object.assign(window.location, {
      assign: (url: string) => assigned.push(url),
    });
    expect(tap("#second", { x: 112, y: 100 })).toBe(false);
    expect(assigned).toEqual(["https://yeehaa.test/essays/first"]);
  });

  it("opens the neighbour a tap lands on, even where the open mark overlaps it", () => {
    setup({ touch: true });
    tap("#first");
    // The open mark is lifted over its neighbour; the finger is on the neighbour.
    expect(tap("#first", { x: 140, y: 100 })).toBe(false);
    expect(openMarks()).toEqual(["second"]);
  });

  it("follows the open mark from its title card", () => {
    setup({ touch: true });
    tap("#first");
    // The card floats above the marks; tapping it anywhere follows the link.
    expect(tap("#first-card", { x: 140, y: 60 })).toBe(true);
  });

  it("keeps one title open at a time", () => {
    setup({ touch: true });
    tap("#first");
    expect(tap("#second")).toBe(false);
    expect(openMarks()).toEqual(["second"]);
  });

  it("closes the title when tapping elsewhere or pressing Escape", () => {
    setup({ touch: true });
    tap("#first");
    tap("#outside");
    expect(openMarks()).toEqual([]);
    tap("#first");
    window.document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(openMarks()).toEqual([]);
  });

  it("leaves the conversation's links alone", () => {
    setup({ touch: true });
    expect(tap(".contact")).toBe(true);
  });
});

describe("atlas with a mouse", () => {
  it("follows a mark on the first click; hover already shows the title", () => {
    setup({ touch: false });
    expect(tap("#first")).toBe(true);
    expect(openMarks()).toEqual([]);
  });
});

describe("atlas terrain motion", () => {
  const still = (): boolean =>
    window.document.querySelector("[data-atlas]")?.hasAttribute("data-still") ??
    false;

  it("pauses while the map is off screen and resumes when it returns", () => {
    setup({ touch: false });
    const callback = observed[0];
    if (!callback) throw new Error("terrain not observed");
    callback([{ isIntersecting: false }]);
    expect(still()).toBe(true);
    callback([{ isIntersecting: true }]);
    expect(still()).toBe(false);
  });

  it("stays still when the visitor prefers reduced motion", () => {
    setup({ touch: false, still: true });
    expect(still()).toBe(true);
    observed[0]?.([{ isIntersecting: true }]);
    expect(still()).toBe(true);
  });
});
