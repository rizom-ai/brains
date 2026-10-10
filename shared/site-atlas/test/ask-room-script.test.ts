import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import {
  ASK_AIMED_EVENT,
  ASK_CITED_EVENT,
  ASK_LENT_EVENT,
  ASK_RETURNED_EVENT,
  ASK_SOURCES_EVENT,
} from "@brains/contracts";
import { ASK_ROOM_SCRIPT } from "../src/templates/ask-room-script";

// The room script ships on its own in the page, so it is tested by running
// it against a page that supplies the parts by attribute: a box listing an
// answer's sources, a drawing with marks, a lead layer.

let window: Window;
let restoreGlobals: RestoreGlobals;
let watchers: Array<() => void>;
let frames: Array<() => void>;
/** An element of the page under test (happy-dom's, not the DOM lib's). */
type El = NonNullable<ReturnType<Window["document"]["querySelector"]>>;
interface Source {
  id: string;
  brain?: { name: string; url?: string };
}
interface Cited {
  key: string;
  source: Source;
  marks: El[];
}
/** What the room tells its root: a cited answer, or a mark aimed at its source. */
interface Told {
  cited?: Cited[];
  marks?: El[];
  unmatched?: Source[];
  mark?: El;
  source?: El;
}
let events: Array<[string, Told]>;
const media: Record<string, boolean> = {};
const mutate = (): void => watchers.forEach((notify) => notify());

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Rect extends Box {
  right: number;
  bottom: number;
}
const rect = (
  left: number,
  top: number,
  width: number,
  height: number,
): Rect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
function place(selector: string, box: Box): void {
  const element = window.document.querySelector(selector);
  if (!element) throw new Error(`fixture: ${selector}`);
  Object.assign(element, {
    getBoundingClientRect: () => rect(box.left, box.top, box.width, box.height),
  });
}

function room(options: { narrow?: boolean; closedList?: boolean } = {}): void {
  media["(max-width: 60rem)"] = options.narrow ?? false;
  watchers = [];
  frames = [];
  events = [];
  const list = options.closedList
    ? `<details><summary id="summary">Sources</summary><ul>
        <li data-ask-source="post:first"><a href="#">First</a></li></ul></details>`
    : `<ul>
        <li data-ask-source="post:first"><a href="#">First</a></li>
        <li data-ask-source="post:handoffs"><a href="#">Handoffs</a></li>
        <li data-ask-source="post:jo"><a href="#">Jo's piece</a></li></ul>`;
  window.document.body.innerHTML = `
    <main data-ask-room>
      <div class="column" data-ask-column>
        <div data-ask-box>
          <div class="brain-box-scroll">
            <div data-ask-dock></div>
            ${list}
          </div>
        </div>
      </div>
      <svg data-ask-leads></svg>
      <div class="drawing" data-ask-drawing>
        <ul>
          <li data-ask-mark="post:first"><a href="/first">First</a></li>
          <li data-ask-mark="becca.rizom.ai"><a href="/agents/becca" aria-label="Becca"></a><button data-ask-aim>Where it’s cited</button></li>
          <li data-ask-mark="jo.rizom.ai"><a href="/agents/jo" aria-label="Jo"></a></li>
        </ul>
      </div>
      <ul class="elsewhere"><li data-ask-mark="becca.rizom.ai"></li></ul>
    </main>`;
  place("[data-ask-leads]", { left: 0, top: 0, width: 1440, height: 900 });
  window.document.querySelectorAll("[data-ask-source]").forEach((row, i) => {
    Object.assign(row, {
      getBoundingClientRect: () => rect(80, 400 + i * 40, 300, 24),
    });
  });
  window.document
    .querySelectorAll("[data-ask-drawing] [data-ask-mark]")
    .forEach((mark, i) => {
      Object.assign(mark, {
        getBoundingClientRect: () => rect(900 + i * 100, 200, 26, 26),
      });
    });
  place(".elsewhere [data-ask-mark]", {
    left: 300,
    top: 1500,
    width: 26,
    height: 26,
  });
  const scroller = window.document.querySelector(".brain-box-scroll");
  if (!scroller) throw new Error("fixture");
  Object.assign(scroller, {
    getBoundingClientRect: () => rect(60, 100, 360, 600),
    scrollTo: (to: { top: number }) => {
      Object.defineProperty(scroller, "scrollTop", {
        value: to.top,
        writable: true,
        configurable: true,
      });
    },
  });
  Object.defineProperty(scroller, "clientHeight", { value: 600 });
  Object.defineProperty(scroller, "scrollTop", {
    value: 0,
    writable: true,
    configurable: true,
  });
  const root = window.document.querySelector("[data-ask-room]");
  [
    ASK_CITED_EVENT,
    ASK_LENT_EVENT,
    ASK_RETURNED_EVENT,
    ASK_AIMED_EVENT,
  ].forEach((name) => {
    root?.addEventListener(name, (event) => {
      const told: Told = Reflect.get(event, "detail");
      events.push([name, told]);
    });
  });
  class Watcher {
    constructor(callback: () => void) {
      watchers.push(callback);
    }
    observe(): void {}
  }
  // The room reads the page's window: its size, media, observers and frames.
  Object.assign(window, {
    innerHeight: 900,
    matchMedia: (query: string) => ({
      matches: media[query] ?? false,
      addEventListener: (): void => undefined,
    }),
    MutationObserver: Watcher,
    requestAnimationFrame: (fn: () => void): number => frames.push(fn),
  });
  restoreGlobals = installGlobals({ window, document: window.document });
  new Function(ASK_ROOM_SCRIPT)();
}

const becca: Source = {
  id: "post:handoffs",
  brain: { name: "Becca", url: "https://becca.rizom.ai" },
};
const jo: Source = { id: "post:jo", brain: { name: "Jo" } };
function answer(sources: Source[], on: "box" | "document" = "box"): void {
  const target =
    on === "box"
      ? window.document.querySelector("[data-ask-box]")
      : window.document;
  target?.dispatchEvent(
    new window.CustomEvent(ASK_SOURCES_EVENT, {
      bubbles: true,
      detail: { sources: sources.map((s) => ({ title: s.id, ...s })) },
    }),
  );
}
const cited = (): string[] =>
  Array.from(
    window.document.querySelectorAll("[data-ask-cited]"),
    (mark) =>
      `${mark.closest(".elsewhere") ? "elsewhere:" : ""}${mark.getAttribute("data-ask-mark")}`,
  );
const leads = (): Array<[string | null, string | null]> =>
  Array.from(
    window.document.querySelectorAll("[data-ask-leads] path"),
    (path) => [path.getAttribute("data-lead"), path.getAttribute("d")],
  );
const host = (): El => {
  const element = window.document.querySelector("[data-ask-box]");
  if (!element) throw new Error("fixture");
  return element;
};
const drawing = (): El => {
  const element = window.document.querySelector("[data-ask-drawing]");
  if (!element) throw new Error("fixture");
  return element;
};
function tap(selector: string): boolean {
  const target = window.document.querySelector(selector);
  if (!target) throw new Error(`missing ${selector}`);
  return target.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  window = new Window({ url: "https://rizom.test/" });
});
afterEach(() => {
  window.close();
  restoreGlobals();
});

describe("the Ask room cites the drawing", () => {
  test("marks what an answer's sources point at: by id, by a brain's address, by a brain's name", () => {
    room();
    answer([{ id: "post:first" }, becca, jo, { id: "post:own" }]);
    expect(cited()).toEqual([
      "post:first",
      "becca.rizom.ai",
      "jo.rizom.ai",
      "elsewhere:becca.rizom.ai",
    ]);
    const [name, told] = events[0] ?? [];
    expect(name).toBe(ASK_CITED_EVENT);
    expect(
      told?.cited?.map((c) => [c.source.id, c.key, c.marks.length]),
    ).toEqual([
      ["post:first", "post:first", 1],
      [becca.id, "becca.rizom.ai", 2],
      ["post:jo", "jo.rizom.ai", 1],
    ]);
    expect(told?.marks).toHaveLength(4);
    expect(told?.unmatched?.map((s) => s.id)).toEqual(["post:own"]);
  });

  test("lets go for an answer without sources, and hears an answer told to the document", () => {
    room();
    answer([becca]);
    answer([]);
    expect(cited()).toEqual([]);
    expect(events.at(-1)?.[0]).toBe(ASK_CITED_EVENT);
    answer([jo], "document");
    expect(cited()).toEqual(["jo.rizom.ai"]);
  });
});

describe("the Ask room leads listed sources to their marks", () => {
  test("on a wide screen, from just right of each listed source to just short of its mark in the drawing, in the lead layer's frame", () => {
    room();
    answer([{ id: "post:first" }, becca, { id: "post:own" }]);
    expect(
      window.document
        .querySelector("[data-ask-leads]")
        ?.getAttribute("viewBox"),
    ).toBe("0 0 1440 900");
    expect(leads()).toEqual([
      ["post:first", "M386 412 C645 412 645 213 904 213"],
      [becca.id, "M386 452 C695 452 695 213 1004 213"],
    ]);
    // The layer's own box is the frame, wherever the page puts it.
    place("[data-ask-leads]", { left: 40, top: 20, width: 1400, height: 880 });
    answer([{ id: "post:first" }]);
    expect(
      window.document
        .querySelector("[data-ask-leads]")
        ?.getAttribute("viewBox"),
    ).toBe("0 0 1400 880");
    expect(leads()).toEqual([
      ["post:first", "M346 392 C605 392 605 193 864 193"],
    ]);
    answer([]);
    expect(leads()).toEqual([]);
  });

  test("leads from a closed list's summary while the list is closed", () => {
    room({ closedList: true });
    place("#summary", { left: 80, top: 300, width: 120, height: 20 });
    answer([{ id: "post:first" }]);
    expect(leads()[0]?.[1]).toStartWith("M206 310 ");
  });

  test("draws no lead to a source hidden in its scroller or off screen, nor to a mark off screen", () => {
    room();
    const scroller = window.document.querySelector(".brain-box-scroll");
    if (!(scroller instanceof window.HTMLElement)) throw new Error("fixture");
    scroller.style.overflowY = "auto";
    // The conversation shows 100–700; the source sits below that.
    place(`[data-ask-source="post:first"]`, {
      left: 80,
      top: 760,
      width: 300,
      height: 24,
    });
    answer([{ id: "post:first" }]);
    expect(leads()).toEqual([]);
    scroller.style.overflowY = "visible";
    place(`[data-ask-source="post:first"]`, {
      left: 80,
      top: -40,
      width: 300,
      height: 24,
    });
    answer([{ id: "post:first" }]);
    expect(leads()).toEqual([]);
    place(`[data-ask-source="post:first"]`, {
      left: 80,
      top: 400,
      width: 300,
      height: 24,
    });
    place(`[data-ask-drawing] [data-ask-mark="post:first"]`, {
      left: 900,
      top: 920,
      width: 26,
      height: 26,
    });
    answer([{ id: "post:first" }]);
    expect(leads()).toEqual([]);
  });

  test("draws none on a phone, where the drawing stands above the words", () => {
    room({ narrow: true });
    answer([{ id: "post:first" }]);
    expect(cited()).toEqual(["post:first"]);
    expect(leads()).toEqual([]);
  });

  test("redraws as the page or the conversation scrolls", () => {
    room();
    answer([{ id: "post:first" }]);
    place(`[data-ask-source="post:first"]`, {
      left: 80,
      top: 300,
      width: 300,
      height: 24,
    });
    window.document
      .querySelector(".brain-box-scroll")
      ?.dispatchEvent(new window.Event("scroll"));
    frames.splice(0).forEach((frame) => frame());
    expect(leads()[0]?.[1]).toStartWith("M386 312 ");
  });
});

describe("the Ask room lends its drawing to a phone's open conversation", () => {
  test("into the dock once it is there, a slot holding its place, and takes it back on close", () => {
    room();
    const home = drawing().parentElement;
    const dock =
      window.document.querySelector("[data-ask-dock]")?.parentElement;
    // The boot opens the sheet before the box has mounted its dock.
    dock?.querySelector("[data-ask-dock]")?.remove();
    host().setAttribute("data-ask-sheet", "");
    mutate();
    expect(drawing().parentElement).toBe(home);
    dock?.insertAdjacentHTML("afterbegin", "<div data-ask-dock></div>");
    mutate();
    expect(drawing().parentElement?.hasAttribute("data-ask-dock")).toBe(true);
    expect(
      home?.querySelector("[data-ask-slot]")?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(events.map(([name]) => name)).toEqual([ASK_LENT_EVENT]);
    host().removeAttribute("data-ask-sheet");
    mutate();
    expect(drawing().parentElement).toBe(home);
    expect(home?.querySelector("[data-ask-slot]")).toBe(null);
    expect(events.map(([name]) => name)).toEqual([
      ASK_LENT_EVENT,
      ASK_RETURNED_EVENT,
    ]);
  });

  test("in the open conversation, a mark's aim brings its listed source to the middle and flashes it", () => {
    room();
    host().setAttribute("data-ask-sheet", "");
    mutate();
    answer([becca, jo]);
    expect(tap("[data-ask-aim]")).toBe(false);
    const scroller = window.document.querySelector(".brain-box-scroll");
    // Becca's row sits at 440 in a region showing 600px from 100: centred, 52px down.
    expect(scroller?.scrollTop).toBe(52);
    const row = window.document.querySelector(
      `[data-ask-source="${becca.id}"]`,
    );
    expect(row?.hasAttribute("data-ask-flash")).toBe(true);
    const aimed = events.find(([name]) => name === ASK_AIMED_EVENT)?.[1];
    expect(aimed?.source).toBe(row ?? undefined);
    expect(aimed?.mark?.getAttribute("data-ask-mark")).toBe("becca.rizom.ai");
    // A mark without an aim of its own is the aim.
    expect(tap(`[data-ask-mark="jo.rizom.ai"] a`)).toBe(false);
    expect(scroller?.scrollTop).toBe(144);
  });

  test("outside the open conversation, and for a mark nothing cites, a tap is left alone", () => {
    room();
    answer([becca]);
    expect(tap("[data-ask-aim]")).toBe(true);
    host().setAttribute("data-ask-sheet", "");
    mutate();
    expect(tap(`[data-ask-mark="jo.rizom.ai"] a`)).toBe(true);
    expect(window.document.querySelectorAll("[data-ask-flash]")).toHaveLength(
      0,
    );
  });
});
