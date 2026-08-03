import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { CONSOLE_CLIMATE_SCRIPT } from "../src";

let window: Window;

function runClimateScript(): void {
  eval(CONSOLE_CLIMATE_SCRIPT);
}

beforeEach(() => {
  window = new Window({ url: "http://brain.test/dashboard" });
  window.document.documentElement.setAttribute("data-climate", "instrument");
  window.document.body.innerHTML = '<button id="climateToggle"></button>';
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
  });
});

afterEach(() => {
  window.close();
  delete (globalThis as Record<string, unknown>)["window"];
  delete (globalThis as Record<string, unknown>)["document"];
  delete (globalThis as Record<string, unknown>)["localStorage"];
});

describe("console climate behavior", () => {
  it("maps the initial instrument climate to dark theme tokens", () => {
    runClimateScript();

    expect(window.document.documentElement.getAttribute("data-climate")).toBe(
      "instrument",
    );
    expect(window.document.documentElement.getAttribute("data-theme")).toBe(
      "dark",
    );
  });

  it("maps a stored paper climate to light theme tokens before binding", () => {
    window.localStorage.setItem("console.climate", "paper");

    runClimateScript();

    expect(window.document.documentElement.getAttribute("data-climate")).toBe(
      "paper",
    );
    expect(window.document.documentElement.getAttribute("data-theme")).toBe(
      "light",
    );
    expect(
      window.document
        .getElementById("climateToggle")
        ?.getAttribute("aria-label"),
    ).toBe("Switch to instrument climate");
  });

  it("updates the climate, theme mode, and stored preference together", () => {
    runClimateScript();

    window.document
      .getElementById("climateToggle")
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(window.document.documentElement.getAttribute("data-climate")).toBe(
      "paper",
    );
    expect(window.document.documentElement.getAttribute("data-theme")).toBe(
      "light",
    );
    expect(window.localStorage.getItem("console.climate")).toBe("paper");
  });
});
