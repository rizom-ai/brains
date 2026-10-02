import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import { storyRuntimeScript } from "../../src/story/runtime";

// The shipped script runs on its own in the page, so it is tested by running
// it: any name it borrows from the module it was written in fails here.

let window: Window;
let restoreGlobals: RestoreGlobals;
let tops: number[] = [];

function page(options: {
  viewport: number;
  stages: number;
  chapters: number;
  strip?: number;
}): void {
  const figureStyle = options.strip === undefined ? "" : ' style="--strip: 1"';
  window.document.body.innerHTML = `
    <div class="story">
      <div class="chapters">
        ${Array.from(
          { length: options.chapters },
          (_, i) =>
            `<section class="chapter" id="c${i}"><p class="eyebrow">Chapter ${i}</p></section>`,
        ).join("")}
      </div>
      <figure class="figure spec" data-stage="0" data-stages="${options.stages}"${figureStyle}></figure>
    </div>`;
  Object.assign(window, { innerHeight: options.viewport });
  window.document.querySelectorAll(".chapter").forEach((chapter, i) => {
    Object.assign(chapter, {
      getBoundingClientRect: () => ({ top: tops[i] ?? 0 }),
    });
  });
  const figure = window.document.querySelector(".figure");
  Object.assign(figure ?? {}, {
    getBoundingClientRect: () => ({ top: 74, bottom: options.strip ?? 0 }),
  });
  restoreGlobals = installGlobals({
    window,
    document: window.document,
    innerHeight: options.viewport,
    scrollY: 0,
    addEventListener: window.addEventListener.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
  });
}

function run(): void {
  // Evaluated as the page evaluates it: a script with no module around it.
  new Function(storyRuntimeScript)();
}

function scrollTo(next: number[]): void {
  tops = next;
  window.dispatchEvent(new window.Event("scroll"));
}

function reading(): {
  stage: string | null | undefined;
  current: string | undefined;
} {
  return {
    stage: window.document.querySelector(".figure")?.getAttribute("data-stage"),
    current: window.document.querySelector(".chapter.is-current")?.id,
  };
}

beforeEach(() => {
  window = new Window({ url: "https://rizom.test/brain" });
  tops = [];
});

afterEach(() => {
  restoreGlobals();
  window.close();
});

describe("the shipped story script", () => {
  test("moves the drawing's stage as the chapters pass the reading line beside it", () => {
    page({ viewport: 1000, stages: 3, chapters: 3 });
    tops = [0, 600, 1400];
    expect(run).not.toThrow();
    expect(reading()).toEqual({ stage: "0", current: "c0" });
    // Line at 45%: the second chapter's top at 440 has passed it.
    scrollTo([-700, 440, 1200]);
    expect(reading()).toEqual({ stage: "1", current: "c1" });
    scrollTo([-1800, -1000, 200]);
    expect(reading()).toEqual({ stage: "2", current: "c2" });
    // And back up.
    scrollTo([-700, 460, 1200]);
    expect(reading()).toEqual({ stage: "0", current: "c0" });
  });

  test("holds the last stage when a page has more chapters than stages", () => {
    page({ viewport: 1000, stages: 2, chapters: 4 });
    tops = [0, 800, 1600, 2400];
    run();
    scrollTo([-2400, -1600, -800, 0]);
    expect(reading()).toEqual({ stage: "1", current: "c3" });
  });

  test("reads just under the strip when the drawing is stacked above the chapters", () => {
    page({ viewport: 844, stages: 3, chapters: 3, strip: 428 });
    tops = [428, 1200, 2000];
    expect(run).not.toThrow();
    // A chapter at the strip's bottom is the one being read, though it is
    // below 45% of the viewport.
    expect(reading()).toEqual({ stage: "0", current: "c0" });
    scrollTo([-400, 428, 1300]);
    expect(reading()).toEqual({ stage: "1", current: "c1" });
  });
});

// The homepage's drawing listens to the Ask box: an answer's sources name the
// brains whose published memory they came from, and those brains light.
describe("the opening listens to the network's answer", () => {
  const brains = ["becca.rizom.ai", "jo.rizom.ai", "sam.rizom.ai"];
  function opening(): void {
    window.document.body.innerHTML = `
      <div class="story">
        <div class="chapters">
          <section class="chapter chapter--opening" id="hero">
            <div class="ask"><div data-ask-box="">
              <ul class="brain-box-sources">
                <li data-ask-source="network-piece:becca/post/handoffs"><a href="#">Handoffs</a></li>
                <li data-ask-source="post:what-a-brain-is"><a href="#">What a brain is</a></li>
              </ul>
            </div></div>
            <div class="net-layer">
              <svg class="net-svg">
                ${brains.map((b) => `<line class="net-thread" data-brain="${b}"></line>`).join("")}
                ${brains.map((b) => `<g class="net-reply" data-brain="${b}"></g>`).join("")}
                <circle class="net-lantern"></circle>
              </svg>
              <ul class="net-marks">
                ${brains.map((b) => `<li class="net-mark" data-brain="${b}"><a href="/agents/${b}" aria-label="${b.split(".")[0]}"></a></li>`).join("")}
              </ul>
              <ol class="net-names">
                ${brains.map((b) => `<li class="net-name" data-brain="${b}">${b.split(".")[0]}</li>`).join("")}
              </ol>
            </div>
          </section>
        </div>
        <figure class="figure" data-stage="0" data-stages="6"></figure>
      </div>`;
    restoreGlobals = installGlobals({
      window,
      document: window.document,
      innerHeight: 900,
      scrollY: 0,
      addEventListener: window.addEventListener.bind(window),
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    new Function(storyRuntimeScript)();
  }
  function answer(
    sources: Array<{ id: string; brain?: { name: string; url?: string } }>,
  ): void {
    window.document.querySelector("[data-ask-box]")?.dispatchEvent(
      new window.CustomEvent("ask:sources", {
        bubbles: true,
        detail: { sources: sources.map((s) => ({ title: s.id, ...s })) },
      }),
    );
  }
  const lit = (): string[] =>
    Array.from(window.document.querySelectorAll(".net-mark.is-lit")).map(
      (m) => m.getAttribute("data-brain") ?? "",
    );
  const layer = (): DOMTokenList => {
    const layer = window.document.querySelector(".net-layer");
    if (!layer) throw new Error("Missing drawing");
    return layer.classList;
  };

  test("lights the brains an answer's sources came from, and dims the rest", () => {
    opening();
    answer([
      {
        id: "network-piece:becca/post/handoffs",
        brain: { name: "Becca", url: "https://becca.rizom.ai" },
      },
      {
        id: "network-piece:jo/note/x",
        brain: { name: "Jo", url: "https://jo.rizom.ai/" },
      },
    ]);
    expect(lit()).toEqual(["becca.rizom.ai", "jo.rizom.ai"]);
    expect(layer().contains("has-replies")).toBe(true);
    expect(layer().contains("is-rizom")).toBe(false);
    expect(
      window.document
        .querySelector('.net-thread[data-brain="becca.rizom.ai"]')
        ?.classList.contains("is-lit"),
    ).toBe(true);
    expect(
      window.document
        .querySelector('.net-reply[data-brain="sam.rizom.ai"]')
        ?.classList.contains("is-lit"),
    ).toBe(false);
    expect(
      window.document
        .querySelector('.net-name[data-brain="jo.rizom.ai"]')
        ?.classList.contains("is-lit"),
    ).toBe(true);
  });

  test("lights the center for Rizom's own pieces, by name when a brain has no address", () => {
    opening();
    answer([
      { id: "post:what-a-brain-is" },
      { id: "network-piece:sam/note/y", brain: { name: "sam" } },
    ]);
    expect(layer().contains("is-rizom")).toBe(true);
    expect(lit()).toEqual(["sam.rizom.ai"]);
  });

  test("lets go for an answer without sources, and relights for the next", () => {
    opening();
    answer([
      {
        id: "network-piece:becca/post/handoffs",
        brain: { name: "Becca", url: "https://becca.rizom.ai" },
      },
    ]);
    answer([]);
    expect(lit()).toEqual([]);
    expect(layer().contains("has-replies")).toBe(false);
    answer([
      {
        id: "network-piece:jo/note/x",
        brain: { name: "Jo", url: "https://jo.rizom.ai" },
      },
    ]);
    expect(lit()).toEqual(["jo.rizom.ai"]);
  });

  test("points both ways: a listed source lights its brain, a brain flags its source", () => {
    opening();
    answer([
      {
        id: "network-piece:becca/post/handoffs",
        brain: { name: "Becca", url: "https://becca.rizom.ai" },
      },
    ]);
    const row = window.document.querySelector(
      '[data-ask-source="network-piece:becca/post/handoffs"]',
    );
    if (!row) throw new Error("Missing source row");
    row.dispatchEvent(new window.Event("mouseover", { bubbles: true }));
    expect(
      window.document
        .querySelector('.net-mark[data-brain="becca.rizom.ai"]')
        ?.classList.contains("is-hot"),
    ).toBe(true);
    row.dispatchEvent(new window.Event("mouseout", { bubbles: true }));
    expect(window.document.querySelector(".net-mark.is-hot")).toBeNull();
    const mark = window.document.querySelector(
      '.net-mark[data-brain="becca.rizom.ai"] a',
    );
    if (!mark) throw new Error("Missing mark");
    mark.dispatchEvent(new window.Event("mouseover", { bubbles: true }));
    expect(row.hasAttribute("data-ask-hot")).toBe(true);
  });
});
