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
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "localStorage");
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

  it.each(["late mount", "remount"])(
    "supports a toggle after %s",
    async (scenario) => {
      if (scenario === "late mount") window.document.body.innerHTML = "";
      runClimateScript();
      window.document.body.innerHTML = '<button id="climateToggle">◐</button>';
      await window.happyDOM.whenAsyncComplete();

      const button = window.document.querySelector("button");
      expect(button?.getAttribute("aria-label")).toBe(
        "Switch to paper climate",
      );
      button?.click();
      expect(window.document.documentElement.getAttribute("data-climate")).toBe(
        "paper",
      );
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "light",
      );
      expect(window.localStorage.getItem("console.climate")).toBe("paper");
      expect(button?.getAttribute("aria-label")).toBe(
        "Switch to instrument climate",
      );
      button?.click();
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "dark",
      );
      expect(window.localStorage.getItem("console.climate")).toBe("instrument");
    },
  );

  it("handles nested targets but ignores unrelated controls", () => {
    runClimateScript();
    window.document.body.insertAdjacentHTML(
      "beforeend",
      "<button>Other</button>",
    );
    window.document
      .querySelector("button:last-child")
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(window.document.documentElement.getAttribute("data-climate")).toBe(
      "instrument",
    );

    const button = window.document.getElementById("climateToggle");
    button?.insertAdjacentHTML("beforeend", "<span>Toggle</span>");
    button?.querySelector("span")?.click();
    expect(window.document.documentElement.getAttribute("data-climate")).toBe(
      "paper",
    );
  });

  it("still toggles when preference storage is unavailable", () => {
    Object.assign(globalThis, {
      localStorage: {
        getItem: () => {
          throw new Error("Storage blocked");
        },
        setItem: () => {
          throw new Error("Storage blocked");
        },
      },
    });
    runClimateScript();
    window.document
      .getElementById("climateToggle")
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(window.document.documentElement.getAttribute("data-theme")).toBe(
      "light",
    );
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
