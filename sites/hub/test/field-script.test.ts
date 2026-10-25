import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import { fieldScript, fieldScriptSource } from "../src/field/script";

// The shipped script runs on its own in the page, so it is tested by running
// it: any name it borrows from the module it was written in fails here.
// happy-dom has no 2D canvas, so these runs also prove the chapters keep
// working where the field cannot draw.

let window: Window;
let restoreGlobals: RestoreGlobals;

function page(scenes: string[], viewport: number): void {
  window.document.body.innerHTML = `
    <canvas class="hub-field" aria-hidden="true"></canvas>
    <main>${scenes
      .map((scene) => `<section data-hub-scene="${scene}"></section>`)
      .join("")}</main>`;
  window.document.querySelectorAll("[data-hub-scene]").forEach((el, i) => {
    Object.defineProperty(el, "offsetTop", { value: i * 1000 });
    Object.defineProperty(el, "offsetHeight", { value: 1000 });
  });
  restoreGlobals = installGlobals({
    window,
    document: window.document,
    innerWidth: 1440,
    innerHeight: viewport,
    scrollY: 0,
    devicePixelRatio: 1,
    matchMedia: window.matchMedia.bind(window),
    addEventListener: window.addEventListener.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: () => 0,
    MutationObserver: window.MutationObserver,
  });
}

function run(): void {
  // Evaluated as the page evaluates it: a script with no module around it.
  new Function(fieldScriptSource)();
}

function scroll(to: number): void {
  Reflect.set(globalThis, "scrollY", to);
  window.dispatchEvent(new window.Event("scroll"));
}

const current = (): string | undefined =>
  window.document.documentElement.dataset["hubCurrent"];

beforeEach(() => {
  window = new Window({ url: "https://hub.rizom.test/" });
});

afterEach(() => {
  restoreGlobals();
});

describe("the field script", () => {
  test("names the chapter under the middle of the screen", () => {
    page(["opening", "pipeline"], 800);
    run();
    expect(current()).toBe("opening");
    scroll(700);
    expect(current()).toBe("pipeline");
    scroll(0);
    expect(current()).toBe("opening");
  });

  test("starts the reader on a chapter whose scene it does not draw yet", () => {
    page(["opening", "somewhere-later"], 800);
    run();
    scroll(900);
    expect(current()).toBe("somewhere-later");
  });

  test("stands down on a page with no chapters", () => {
    page([], 800);
    run();
    expect(current()).toBeUndefined();
  });

  test("ships as one script element that nothing inside can close", () => {
    expect(fieldScriptSource).not.toContain("</script");
    expect(fieldScript.startsWith("<script>")).toBe(true);
    expect(fieldScript.endsWith("</script>")).toBe(true);
    expect(fieldScript).toContain(fieldScriptSource);
  });
});
