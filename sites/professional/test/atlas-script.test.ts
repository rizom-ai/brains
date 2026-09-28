import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import { ASK_SOURCES_EVENT } from "@brains/contracts";
import { HOMEPAGE_ATLAS_SCRIPT } from "../src/templates/homepage-atlas-script";

let window: Window;
let restoreGlobals: RestoreGlobals;
let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void>;
/**
 * The page's mutation observers. happy-dom holds an observer's callback only
 * weakly, so garbage collection can drop it mid-test; tests deliver the
 * changes themselves, as a browser does once the current task ends.
 */
let watchers: Array<() => void>;
const mutate = (): void => watchers.forEach((notify) => notify());

const media: Record<string, boolean> = {};

function setup(options: {
  touch: boolean;
  still?: boolean;
  chat?: "live" | "off";
}): void {
  media["(hover: none)"] = options.touch;
  media["(prefers-reduced-motion: reduce)"] = options.still ?? false;
  window.document.body.innerHTML = `
    <section data-atlas>
      <a class="contact" href="/contact" data-atlas-door>Let’s talk</a>
      <div data-ask-box><p data-ask-status></p><textarea ${options.chat === "live" ? "" : "disabled"}></textarea><button data-ask-send>Send</button></div>
      <a id="topic" href="/contact?topic=What+is+Rizom%3F" data-atlas-door data-atlas-fill="What is Rizom?">What is Rizom?</a>
      <svg data-atlas-leads></svg>
      <div class="atlas__map" data-atlas-map><div data-atlas-field>
        <svg data-atlas-terrain></svg>
        <ul>
          <li data-atlas-mark data-atlas-key="post:first" style="left: 20%; top: 30%"><a id="first" href="/essays/first"><span id="first-card" data-atlas-tip>First</span></a><button id="first-cited" data-atlas-cited>Where it’s cited ↓</button></li>
          <li data-atlas-mark data-atlas-key="post:second" style="left: 60%; top: 40%"><a id="second" href="/essays/second"><span>Second</span></a></li>
          <li data-atlas-mark data-atlas-key="post:third" style="left: 50%; top: 92%"><a id="third" href="/essays/third"><span>Third</span></a></li>
        </ul>
      </div></div>
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
  watchers = [];
  class Watcher {
    constructor(callback: () => void) {
      watchers.push(callback);
    }
    observe(): void {}
  }
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
    // The page's own Event, as a browser page has it.
    Event: window.Event,
    IntersectionObserver: Observer,
    MutationObserver: Watcher,
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

describe("atlas door", () => {
  const door = (id: string): URLSearchParams =>
    new URL(
      window.document.getElementById(id)?.getAttribute("href") ?? "",
      "https://yeehaa.test/",
    ).searchParams;

  it("carries the visitor's theme to the contact form, which cannot read it, and follows a change", () => {
    window.document.documentElement.setAttribute("data-theme", "light");
    setup({ touch: true });
    window.document.querySelector(".contact")?.setAttribute("id", "contact");
    expect(door("topic").get("theme")).toBe("light");
    expect(door("topic").get("topic")).toBe("What is Rizom?");
    expect(door("contact").get("theme")).toBe("light");

    window.document.documentElement.setAttribute("data-theme", "dark");
    mutate();
    expect(door("topic").get("theme")).toBe("dark");
    expect(door("contact").get("theme")).toBe("dark");
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

/** Lists sources the way a mounted answer does; each item is 20px tall, 50px wide, from x 10. */
function listSources(ids: string[], open: boolean): void {
  const host = window.document.querySelector("[data-ask-box]");
  if (!host) throw new Error("missing ask box");
  host.insertAdjacentHTML(
    "beforeend",
    `<details${open ? " open" : ""}><summary>Sources</summary><ol>${ids
      .map((id) => `<li data-ask-source="${id}">${id}</li>`)
      .join("")}</ol></details>`,
  );
  const place = (element: object, top: number): void => {
    Object.assign(element, {
      getBoundingClientRect: () => ({
        left: 10,
        top,
        width: 50,
        height: 20,
        right: 60,
        bottom: top + 20,
      }),
    });
  };
  const summary = host.querySelector("summary");
  if (summary) place(summary, 260);
  if (open)
    host.querySelectorAll("[data-ask-source]").forEach((item, index) => {
      place(item, 300 + index * 30);
    });
}

describe("atlas and its chat", () => {
  const draft = (): string =>
    String(
      Reflect.get(window.document.querySelector("textarea") ?? {}, "value") ??
        "",
    );
  const answer = (ids: string[]): void => {
    window.document.querySelector("[data-ask-box]")?.dispatchEvent(
      new window.CustomEvent(ASK_SOURCES_EVENT, {
        bubbles: true,
        detail: { sources: ids.map((id) => ({ id, title: id })) },
      }),
    );
  };
  const focused = (): boolean =>
    window.document
      .querySelector("[data-atlas-field]")
      ?.hasAttribute("data-focused") ?? false;
  const zoom = (): string => {
    const field = window.document.querySelector("[data-atlas-field]");
    return field instanceof window.HTMLElement
      ? field.style.getPropertyValue("--atlas-focus-scale")
      : "";
  };

  it("fills the chat draft from a topic when the box is live, without sending", () => {
    setup({ touch: false, chat: "live" });
    expect(tap("#topic")).toBe(false);
    expect(draft()).toBe("What is Rizom?");
    expect(window.document.activeElement.tagName).toBe("TEXTAREA");
  });

  it("follows a topic to the contact form while the box is off", () => {
    setup({ touch: false, chat: "off" });
    expect(tap("#topic")).toBe(true);
    expect(draft()).toBe("");
  });

  it("lights the sources an answer drew on and turns the map towards them", () => {
    setup({ touch: false, chat: "live" });
    answer(["post:first"]);
    const cited = Array.from(
      window.document.querySelectorAll("[data-atlas-mark][data-cited]"),
    ).map((mark) => mark.getAttribute("data-atlas-key"));
    expect(cited).toEqual(["post:first"]);
    expect(focused()).toBe(true);
  });

  it("says how far down the map the sources sit, for a strip that slides to them", () => {
    setup({ touch: false, chat: "live" });
    answer(["post:first"]);
    const field = window.document.querySelector("[data-atlas-field]");
    const mark = window.document.querySelector('[data-atlas-key="post:first"]');
    if (
      !(field instanceof window.HTMLElement) ||
      !(mark instanceof window.HTMLElement)
    )
      throw new Error("Missing atlas fixture");
    expect(Number(field.style.getPropertyValue("--atlas-strip-y"))).toBe(
      parseFloat(mark.style.top),
    );
  });

  describe("in a phone's open conversation", () => {
    const root = (): ReturnType<typeof window.document.querySelector> =>
      window.document.querySelector("[data-atlas]");
    const host = (): ReturnType<typeof window.document.querySelector> =>
      window.document.querySelector("[data-ask-box]");
    const region = (): InstanceType<typeof window.HTMLElement> => {
      const element = window.document.querySelector(".brain-box-scroll");
      if (!(element instanceof window.HTMLElement))
        throw new Error("Missing conversation region");
      return element;
    };
    const sheet = (): void => {
      host()?.setAttribute("data-ask-sheet", "");
      mutate();
    };
    /** The open conversation's scroll region, listing the answer's source. */
    const conversation = (): void => {
      host()?.insertAdjacentHTML(
        "afterbegin",
        '<div class="brain-box-scroll"><div data-ask-dock></div><ul class="brain-box-sources"><li data-ask-source="post:first"><a id="source-first" href="/essays/first">First</a></li></ul></div>',
      );
      // happy-dom scrolls smoothly later; where a scroll lands is what counts.
      const scroller = region();
      Object.assign(scroller, {
        scrollTo: (to: { top: number }): void => {
          scroller.scrollTop = to.top;
        },
      });
    };

    it("follows how far the answer has scrolled, so the map shrinks as it scrolls beneath it", () => {
      setup({ touch: true, chat: "live" });
      conversation();
      sheet();
      region().scrollTop = 120;
      region().dispatchEvent(new window.Event("scroll"));
      const map = root();
      if (!(map instanceof window.HTMLElement))
        throw new Error("Missing atlas");
      expect(map.style.getPropertyValue("--atlas-sheet-scroll")).toBe("120px");
    });

    it("takes a tapped source to its piece: back to the full map, the piece pulsing with its card open", () => {
      setup({ touch: true, chat: "live" });
      conversation();
      sheet();
      answer(["post:first"]);
      region().scrollTop = 300;
      expect(tap("#source-first")).toBe(false);
      expect(region().scrollTop).toBe(0);
      expect(openMarks()).toEqual(["first"]);
      const piece = window.document.querySelector(
        '[data-atlas-key="post:first"]',
      );
      expect(piece?.hasAttribute("data-atlas-pulse")).toBe(true);
    });

    it("leaves a source a plain link outside the phone's conversation", () => {
      setup({ touch: false, chat: "live" });
      conversation();
      answer(["post:first"]);
      expect(tap("#source-first")).toBe(true);
    });

    it("from a piece's card, shows where the answer cites it", () => {
      setup({ touch: true, chat: "live" });
      conversation();
      sheet();
      answer(["post:first"]);
      const source = window.document.querySelector(
        '[data-ask-source="post:first"]',
      );
      if (!source) throw new Error("Missing source");
      // The region shows 400px from its top at 100; the source sits 900px down.
      Object.defineProperty(region(), "clientHeight", { value: 400 });
      Object.assign(region(), {
        getBoundingClientRect: () => new window.DOMRect(0, 100, 390, 400),
      });
      Object.assign(source, {
        getBoundingClientRect: () => new window.DOMRect(0, 1000, 100, 30),
      });
      tap("#source-first");
      tap("#first-cited");
      expect(region().scrollTop).toBe(900 - 200 + 15);
      expect(source.hasAttribute("data-atlas-flash")).toBe(true);
      expect(openMarks()).toEqual([]);
    });

    it("lends its map to the open conversation's dock, holding its place on the page, and takes it back on close", () => {
      setup({ touch: true, chat: "live" });
      conversation();
      const map = window.document.querySelector("[data-atlas-map]");
      const home = map?.parentElement;
      sheet();
      expect(map?.parentElement?.hasAttribute("data-ask-dock")).toBe(true);
      expect(home?.querySelector(".atlas__map-slot")).not.toBe(null);
      host()?.removeAttribute("data-ask-sheet");
      mutate();
      expect(map?.parentElement).toBe(home);
      expect(home?.querySelector(".atlas__map-slot")).toBe(null);
    });

    it("lends the map only once the conversation's dock is there", () => {
      setup({ touch: true, chat: "live" });
      const map = window.document.querySelector("[data-atlas-map]");
      const home = map?.parentElement;
      // The boot opens the sheet before the box has mounted.
      sheet();
      expect(map?.parentElement).toBe(home);
      conversation();
      mutate();
      expect(map?.parentElement?.hasAttribute("data-ask-dock")).toBe(true);
    });
  });

  it("marks the map as panning only while an answer moves it, so opening a strip never slides it", async () => {
    setup({ touch: false, chat: "live" });
    const field = window.document.querySelector("[data-atlas-field]");
    if (!(field instanceof window.HTMLElement))
      throw new Error("Missing atlas fixture");
    expect(field.hasAttribute("data-atlas-panning")).toBe(false);
    answer(["post:first"]);
    expect(field.hasAttribute("data-atlas-panning")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(field.hasAttribute("data-atlas-panning")).toBe(false);
  });

  it("zooms all the way towards sources that stay in view", () => {
    setup({ touch: false, chat: "live" });
    answer(["post:first", "post:second"]);
    expect(zoom()).toBe("1.25");
  });

  it("lights sources too far apart to zoom without pushing one out of view", () => {
    setup({ touch: false, chat: "live" });
    // Zooming around their middle would push the lower one off the map.
    answer(["post:first", "post:third"]);
    expect(focused()).toBe(true);
    expect(zoom()).toBe("1");
  });

  const leads = (): Array<[string | null, string | null]> =>
    Array.from(
      window.document.querySelectorAll("[data-atlas-leads] path"),
      (path) => [path.getAttribute("data-lead"), path.getAttribute("d")],
    );

  it("on desktop, leads each listed source of the answer to its mark", () => {
    setup({ touch: false, chat: "live" });
    listSources(["post:first"], true);
    // The second source is cited but not listed, so nothing leads to it.
    answer(["post:first", "post:second"]);
    // From just right of the listed source to just short of the mark at (100, 100).
    expect(leads()).toEqual([["post:first", "M66 310 C106 310 51 100 91 100"]]);
  });

  it("leads from the list's summary while the list is closed", () => {
    setup({ touch: false, chat: "live" });
    listSources(["post:first"], false);
    answer(["post:first"]);
    expect(leads()[0]?.[1]).toStartWith("M66 270 ");
  });

  it("draws no leads on a phone, where the map sits above the opening", () => {
    media["(max-width: 60rem)"] = true;
    setup({ touch: true, chat: "live" });
    listSources(["post:first"], true);
    answer(["post:first"]);
    expect(leads()).toEqual([]);
    media["(max-width: 60rem)"] = false;
  });

  it("lets go of the last answer's sources when a new one cites none", () => {
    setup({ touch: false, chat: "live" });
    answer(["post:first"]);
    answer([]);
    expect(window.document.querySelectorAll("[data-cited]")).toHaveLength(0);
    expect(focused()).toBe(false);
    expect(leads()).toEqual([]);
  });
});

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
function box(
  left: number,
  top: number,
  width: number,
  height: number,
): Box & {
  right: number;
  bottom: number;
} {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}
function stub(element: object | null, rect: Box): void {
  if (!element) throw new Error("missing element");
  Object.assign(element, {
    getBoundingClientRect: () =>
      box(rect.left, rect.top, rect.width, rect.height),
  });
}
/** Where a name ends up: its measured box moved by the shift the script set. */
function placed(
  id: string,
  base: Box,
): (Box & { right: number; bottom: number }) | null {
  const label = window.document.getElementById(id);
  if (!(label instanceof window.HTMLElement) || label.hasAttribute("hidden"))
    return null;
  const shift = label.style.getPropertyValue("--atlas-name-shift");
  const [dx = 0, dy = 0] = (shift === "" ? "0px 0px" : shift)
    .split(" ")
    .map((part: string) => Number.parseFloat(part));
  return box(base.left + dx, base.top + dy, base.width, base.height);
}
const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

describe("atlas territory names", () => {
  const field = box(0, 0, 400, 300);
  const first = box(100, 100, 120, 20);
  const second = box(130, 108, 120, 20);
  const edge = box(330, 200, 120, 20);
  const mark = box(260, 60, 9, 9);

  function names(
    labels: Array<[string, Box]>,
    marks: Box[] = [mark],
    area: Box = field,
  ): void {
    window.document.body.innerHTML = `
      <section data-atlas>
        <div data-atlas-field>
          <svg data-atlas-terrain></svg>
          ${labels.map(([id]) => `<span id="${id}" class="atlas__zone" data-atlas-zone>${id}</span>`).join("")}
          <ul>${marks.map((_, index) => `<li data-atlas-mark data-atlas-key="post:${index}"><a href="/${index}"><span class="atlas__glyph"></span></a></li>`).join("")}</ul>
        </div>
      </section>`;
    stub(window.document.querySelector("[data-atlas-field]"), area);
    labels.forEach(([id, rect]) =>
      stub(window.document.getElementById(id), rect),
    );
    window.document
      .querySelectorAll(".atlas__glyph")
      .forEach((glyph, index) => {
        const rect = marks[index];
        if (rect) stub(glyph, rect);
      });
    eval(HOMEPAGE_ATLAS_SCRIPT);
  }

  it("keeps the larger territory's name where it is and moves the next one clear", () => {
    names([
      ["first", first],
      ["second", second],
    ]);
    const a = placed("first", first);
    const b = placed("second", second);
    expect(a).toEqual(first);
    if (!b) throw new Error("second name hidden");
    expect(overlaps(a ?? first, b)).toBe(false);
  });

  it("moves a name off a mark and back inside the map", () => {
    names([
      ["over", box(230, 55, 80, 20)],
      ["edge", edge],
    ]);
    const over = placed("over", box(230, 55, 80, 20));
    const inside = placed("edge", edge);
    if (!over || !inside) throw new Error("name hidden");
    expect(overlaps(over, mark)).toBe(false);
    expect(inside.left + inside.width).toBeLessThanOrEqual(field.width);
  });

  it("keeps names on one line far enough apart to read as two", () => {
    names(
      [
        ["left", box(40, 150, 100, 20)],
        ["right", box(142, 150, 100, 20)],
      ],
      [],
    );
    const left = placed("left", box(40, 150, 100, 20));
    const right = placed("right", box(142, 150, 100, 20));
    if (!left || !right) throw new Error("name hidden");
    const sameLine =
      left.top < right.top + right.height && right.top < left.top + left.height;
    if (sameLine)
      expect(right.left - (left.left + left.width)).toBeGreaterThanOrEqual(14);
  });

  it("keeps names on a phone above the line where the text starts", () => {
    const low = box(100, 140, 80, 20);
    const crossing = (phone: boolean): Box | null => {
      media["(max-width: 60rem)"] = phone;
      names([["low", low]], []);
      const map =
        window.document.querySelector("[data-atlas-field]")?.parentElement;
      if (map instanceof window.HTMLElement)
        map.style.setProperty("--atlas-fill", "0.5");
      eval(HOMEPAGE_ATLAS_SCRIPT);
      media["(max-width: 60rem)"] = false;
      return placed("low", low);
    };
    const onPhone = crossing(true);
    if (!onPhone) throw new Error("name hidden");
    expect(onPhone.top + onPhone.height).toBeLessThanOrEqual(150);
    expect(crossing(false)).toEqual(low);
  });

  it("lets a name move further on a larger map, in proportion to it", () => {
    // The nearest free place is 48px below: within reach of an 800x600 map,
    // too far on a 400x300 one, where the name would leave its territory.
    const label = box(300, 100, 120, 20);
    const wall = box(290, 70, 140, 70);
    names([["blocked", label]], [wall], box(0, 0, 800, 600));
    const large = placed("blocked", label);
    if (!large) throw new Error("name hidden on the large map");
    expect(overlaps(large, wall)).toBe(false);

    names([["blocked", label]], [wall], box(0, 0, 400, 300));
    expect(placed("blocked", label)).toBeNull();
  });

  it("keeps a hidden name's place empty, so a smaller territory's name never stands in for it", () => {
    // Marks leave one pocket, too narrow for the larger name, wide enough for the smaller.
    const walls = [
      box(0, 0, 147, 300),
      box(253, 0, 147, 300),
      box(147, 0, 106, 92),
      box(147, 128, 106, 172),
    ];
    const larger = box(100, 100, 200, 20);
    const smaller = box(170, 102, 60, 20);
    names(
      [
        ["larger", larger],
        ["smaller", smaller],
      ],
      walls,
    );
    expect(placed("larger", larger)).toBeNull();
    const stand = placed("smaller", smaller);
    expect(stand === null || !overlaps(stand, larger)).toBe(true);
  });

  it("hides a name that has no free place rather than printing it over another", () => {
    names(
      [
        ["wide", box(0, 0, 90, 20)],
        ["crowded", box(5, 5, 90, 20)],
      ],
      [],
      box(0, 0, 100, 24),
    );
    expect(placed("wide", box(0, 0, 90, 20))).not.toBeNull();
    expect(placed("crowded", box(5, 5, 90, 20))).toBeNull();
  });
});
