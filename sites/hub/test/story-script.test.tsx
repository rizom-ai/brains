/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import { fieldScriptSource } from "../src/field/script";
import site from "../src";

// The real chapters, rendered from the site's own content, with the field
// script run over them as the page runs it. happy-dom cannot draw, so this
// covers what works without the canvas: the rail, the readouts and every
// control.

let window: Window;
// Stands in for the browser's ResizeObserver: records what is observed and
// lets a test report a size change.
let resized: () => void = () => undefined;
const observed: unknown[] = [];
class FakeResizeObserver {
  constructor(callback: () => void) {
    resized = callback;
  }
  observe(target: unknown): void {
    observed.push(target);
  }
}
let restoreGlobals: RestoreGlobals;
const HEIGHT = 1000;

function chapters(): string {
  const group = [site.sections ?? []]
    .flat()
    .find((candidate) => candidate.namespace === "home");
  const route = site.routes.find((candidate) => candidate.id === "home");
  return (route?.sections ?? [])
    .map((entry) => {
      const section = group?.sections[entry.id];
      if (!section) throw new Error(`no ${entry.id} section`);
      const Section = section.component;
      const props = section.schema.parse(site.content?.["home"]?.[entry.id]);
      return render(<Section {...props} />);
    })
    .join("");
}

function page(width: number, viewport: number): void {
  window.document.body.innerHTML = `<ol class="hub-rail"></ol><main>${chapters()}</main>`;
  window.document.querySelectorAll("[data-hub-scene]").forEach((el, i) => {
    Object.defineProperty(el, "offsetTop", { value: i * HEIGHT });
    Object.defineProperty(el, "offsetHeight", { value: HEIGHT });
  });
  window.document.querySelectorAll(".hub-card").forEach((el) => {
    Object.defineProperty(el, "offsetHeight", {
      value: 300,
      configurable: true,
    });
  });
  restoreGlobals = installGlobals({
    window,
    document: window.document,
    innerWidth: width,
    innerHeight: viewport,
    scrollY: 0,
    devicePixelRatio: 1,
    matchMedia: window.matchMedia.bind(window),
    addEventListener: window.addEventListener.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: () => 0,
    MutationObserver: window.MutationObserver,
    ResizeObserver: FakeResizeObserver,
  });
  new Function(fieldScriptSource)();
}

/** Scrolls so the middle of an 800px screen is `t` of the way through a chapter. */
function readAt(scene: string, t: number): void {
  const index = Array.from(
    window.document.querySelectorAll("[data-hub-scene]"),
  ).findIndex((el) => el.getAttribute("data-hub-scene") === scene);
  Reflect.set(globalThis, "scrollY", index * HEIGHT + t * HEIGHT - 400);
  window.dispatchEvent(new window.Event("scroll"));
}

const text = (selector: string): string =>
  window.document.querySelector(selector)?.textContent.trim() ?? "";

function click(selector: string): void {
  const el = window.document.querySelector(selector);
  if (!el) throw new Error(`nothing at ${selector}`);
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

beforeEach(() => {
  window = new Window({ url: "https://hub.rizom.test/" });
  observed.length = 0;
});

afterEach(() => {
  restoreGlobals();
});

describe("the story, without the canvas", () => {
  test("lists every chapter on the rail and marks the one being read", () => {
    page(1440, 800);
    const labels = Array.from(
      window.document.querySelectorAll(".hub-rail button"),
    ).map((button) => button.textContent);
    expect(labels).toEqual(["Open", "01", "02", "03", "04", "05", "06", "07"]);
    readAt("programs", 0.5);
    expect(text(".hub-rail button.is-current")).toBe("02");
  });

  test("counts who the pipeline has taken from the region", () => {
    page(1440, 800);
    readAt("pipeline", 0);
    expect(text("[data-hub-left]")).toBe("0");
    readAt("pipeline", 0.99);
    expect(Number(text("[data-hub-left]"))).toBeGreaterThan(40);
  });

  test("numbers the cohort in the program, which carries nothing over", () => {
    page(1440, 800);
    readAt("programs", 0.5);
    expect(text("[data-hub-cohort]")).toBe("02");
    expect(text("[data-hub-cohort-text]")).toContain("nothing");
  });

  test("lets the connector leave, and brings them back", () => {
    page(1440, 800);
    readAt("programs", 0.5);
    const before = text("[data-hub-connector-body]");
    click("[data-hub-connector]");
    expect(text("[data-hub-connector]")).toBe("Bring them back");
    expect(text("[data-hub-connector-body]")).toContain(
      "When that person leaves, the hub finds out how little it knew",
    );
    expect(text("[data-hub-connector-body]")).toContain(
      "Heroics are not infrastructure.",
    );
    expect(text("[data-hub-cohort-text]")).toContain(
      "nobody knows whom to call",
    );
    click("[data-hub-connector]");
    expect(text("[data-hub-connector]")).toBe("Let the connector leave");
    expect(text("[data-hub-connector-body]")).toBe(before);
  });

  test("keeps what each cohort leaves with a Brain, and nothing without", () => {
    page(1440, 800);
    readAt("memory", 0.6);
    expect(text("[data-hub-record]")).toBe("28");
    expect(text("[data-hub-record-text]")).toContain("cohort 03 starts");
    click('[data-hub-memory="off"]');
    expect(
      window.document
        .querySelector('[data-hub-memory="off"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(text("[data-hub-record]")).toBe("0");
    expect(text("[data-hub-record-text]")).toContain("again from zero");
    expect(
      window.document.querySelector(".hub-spark")?.classList.contains("is-off"),
    ).toBe(true);
    click('[data-hub-memory="on"]');
    expect(text("[data-hub-record]")).toBe("28");
  });

  test("moves the sparkline's marker with the cohorts", () => {
    page(1440, 800);
    readAt("memory", 0.1);
    const early = Number(
      window.document.querySelector("[data-hub-spark-dot]")?.getAttribute("cx"),
    );
    readAt("memory", 0.9);
    const late = Number(
      window.document.querySelector("[data-hub-spark-dot]")?.getAttribute("cx"),
    );
    expect(late).toBeGreaterThan(early);
  });

  test("lights each lab phase as its weeks pass, the earlier ones done", () => {
    page(1440, 800);
    const states = (): string[] =>
      Array.from(window.document.querySelectorAll("[data-hub-phase]")).map(
        (li) =>
          li.classList.contains("is-on")
            ? "on"
            : li.classList.contains("is-done")
              ? "done"
              : "-",
      );
    readAt("labs", 0.06);
    expect(states()).toEqual(["on", "-", "-", "-"]);
    readAt("labs", 0.5);
    expect(states()).toEqual(["done", "on", "-", "-"]);
    readAt("labs", 0.8);
    expect(states()).toEqual(["done", "done", "on", "-"]);
    readAt("labs", 0.97);
    expect(states()).toEqual(["done", "done", "done", "on"]);
  });

  test("lights the holders one by one, then lets the reader pick", () => {
    page(1440, 800);
    const lit = (): string[] =>
      Array.from(
        window.document.querySelectorAll("[data-hub-holder].is-on"),
      ).map((el) => el.getAttribute("data-hub-holder") ?? "");
    readAt("fit", 0.05);
    expect(lit()).toEqual(["hub"]);
    readAt("fit", 0.45);
    expect(lit()).toEqual(["foundation"]);
    readAt("fit", 0.6);
    expect(lit()).toEqual([]);
    expect(
      window.document
        .querySelector(".hub-holders")
        ?.classList.contains("is-all"),
    ).toBe(true);
    click('[data-hub-holder="bv"]');
    expect(lit()).toEqual(["bv"]);
    click('[data-hub-holder="bv"]');
    expect(lit()).toEqual([]);
  });

  test("pins the holder the reader clicks, after hovering it with a mouse", () => {
    page(1440, 800);
    readAt("fit", 0.6);
    const lit = (): string[] =>
      Array.from(
        window.document.querySelectorAll("[data-hub-holder].is-on"),
      ).map((el) => el.getAttribute("data-hub-holder") ?? "");
    const bv = window.document.querySelector('[data-hub-holder="bv"]');
    if (!bv) throw new Error("no Rizom B.V. holder");
    const pointer = (type: string): void => {
      bv.dispatchEvent(new window.PointerEvent(type, { pointerType: "mouse" }));
    };
    pointer("pointerenter");
    expect(lit()).toEqual(["bv"]);
    click('[data-hub-holder="bv"]');
    pointer("pointerleave");
    expect(lit()).toEqual(["bv"]);
    pointer("pointerenter");
    click('[data-hub-holder="bv"]');
    pointer("pointerleave");
    expect(lit()).toEqual([]);
  });

  test("counts the hubs as they light, and adds the ones the reader plants", () => {
    page(1440, 800);
    readAt("network", 0.02);
    expect(text("[data-hub-hubs]")).toBe("1");
    readAt("network", 0.7);
    expect(text("[data-hub-hubs]")).toBe("22");
    const network = window.document.querySelector("#network");
    network?.dispatchEvent(
      new window.MouseEvent("click", {
        bubbles: true,
        clientX: 900,
        clientY: 400,
      }),
    );
    expect(text("[data-hub-hubs]")).toBe("23");
    window.document.querySelector("#network .hub-card")?.dispatchEvent(
      new window.MouseEvent("click", {
        bubbles: true,
        clientX: 200,
        clientY: 400,
      }),
    );
    expect(text("[data-hub-hubs]")).toBe("23");
  });

  test("docks a card again when it grows on a phone", () => {
    page(390, 844);
    const card = window.document.querySelector("#labs .hub-card");
    if (!card) throw new Error("no labs card");
    expect(observed.includes(card)).toBe(true);
    Object.defineProperty(card, "offsetHeight", { value: 420 });
    resized();
    expect(card.getAttribute("style")).toContain("--card-top: 410px");
  });

  test("docks each chapter's card to the bottom of a phone", () => {
    page(390, 844);
    const card = window.document.querySelector("#pipeline .hub-card");
    expect(card?.getAttribute("style")).toContain("--card-top: 530px");
    const opening = window.document.querySelector("#open .hub-card");
    expect(opening?.getAttribute("style") ?? "").not.toContain("--card-top");
  });
});
