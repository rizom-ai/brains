import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import { CONSOLE_CLIMATE_SCRIPT } from "../src";

let restoreGlobals: RestoreGlobals;
let restoreStorage: RestoreGlobals | undefined;
let window: Window;

function runClimateScript(): void {
  eval(CONSOLE_CLIMATE_SCRIPT);
}

beforeEach(() => {
  window = new Window({ url: "http://brain.test/dashboard" });
  window.document.documentElement.setAttribute("data-climate", "instrument");
  window.document.body.innerHTML = '<button id="climateToggle"></button>';
  restoreGlobals = installGlobals({
    window,
    document: window.document,
    localStorage: window.localStorage,
  });
});

afterEach(() => {
  window.close();
  restoreStorage?.();
  restoreStorage = undefined;
  restoreGlobals();
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
    restoreStorage = installGlobals({
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

  describe("a surface that follows the system color scheme", () => {
    // The operating system's scheme, as matchMedia reports it, and whoever
    // listens for it to change.
    function systemScheme(initiallyDark: boolean): {
      change(dark: boolean): void;
    } {
      const query = {
        matches: initiallyDark,
        listeners: new Array<(event: { matches: boolean }) => void>(),
        addEventListener(
          _type: string,
          listener: (event: { matches: boolean }) => void,
        ): void {
          query.listeners.push(listener);
        },
      };
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (media: string) => {
          if (media !== "(prefers-color-scheme: dark)")
            throw new Error(`Unexpected media query ${media}`);
          return query;
        },
      });
      return {
        change(dark): void {
          query.matches = dark;
          query.listeners.forEach((listener) => listener({ matches: dark }));
        },
      };
    }

    beforeEach(() => {
      window.document.documentElement.setAttribute("data-climate", "paper");
      window.document.documentElement.setAttribute(
        "data-climate-follow-system",
        "",
      );
    });

    it("uses a dark system scheme when no climate was chosen", () => {
      systemScheme(true);
      runClimateScript();
      expect(window.document.documentElement.getAttribute("data-climate")).toBe(
        "instrument",
      );
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "dark",
      );
    });

    it("follows the system scheme when it changes", () => {
      const system = systemScheme(false);
      runClimateScript();
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "light",
      );
      system.change(true);
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "dark",
      );
      expect(
        window.document
          .getElementById("climateToggle")
          ?.getAttribute("aria-label"),
      ).toBe("Switch to paper climate");
    });

    it("keeps a chosen climate over the system scheme", () => {
      window.localStorage.setItem("console.climate", "paper");
      const system = systemScheme(true);
      runClimateScript();
      system.change(true);
      expect(window.document.documentElement.getAttribute("data-climate")).toBe(
        "paper",
      );
    });

    it("stops following the system once a climate is chosen", () => {
      const system = systemScheme(false);
      runClimateScript();
      window.document
        .getElementById("climateToggle")
        ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "dark",
      );
      system.change(false);
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "dark",
      );
    });
  });

  it("keeps the server's climate on a surface that does not follow the system", () => {
    window.document.documentElement.setAttribute("data-climate", "paper");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (): { matches: boolean; addEventListener(): void } => ({
        matches: true,
        addEventListener: (): void => {},
      }),
    });
    runClimateScript();
    expect(window.document.documentElement.getAttribute("data-climate")).toBe(
      "paper",
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
