import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Tests for the pure helpers + palette resolution in
 * `sites/rizom/src/canvases/prelude.canvas.js`.
 *
 * The prelude is a classic `<script>` that declares globals — it
 * doesn't export anything. We load the source text, evaluate it in a
 * controlled sandbox via `new Function`, and extract the helpers via
 * a trailing `return` statement appended to the source. This lets the
 * same file serve as both a browser runtime asset and a unit-tested
 * module without duplicating the implementation.
 */

interface Sandbox {
  parseHex: (hex: string) => [number, number, number];
  rgba: (hex: string, a: number) => string;
  createRand: (seed: number) => {
    next: () => number;
    range: (a: number, b: number) => number;
  };
  isLightMode: () => boolean;
  readPaletteFromCSS: () => Record<string, string>;
  C: Record<string, string>;
}

interface LoadPreludeOpts {
  dataTheme?: string;
  paletteVars?: Record<string, string>;
}

function loadPrelude(opts: LoadPreludeOpts = {}): Sandbox {
  const src = readFileSync(
    join(import.meta.dir, "..", "src", "canvases", "prelude.canvas.js"),
    "utf8",
  );

  // Mock window + document. getComputedStyle returns an object with
  // getPropertyValue that looks up the passed paletteVars map.
  const paletteVars = opts.paletteVars ?? {};
  const mockWindow = {
    devicePixelRatio: 1,
    getComputedStyle: (
      _el: unknown,
    ): {
      getPropertyValue: (name: string) => string;
    } => ({
      getPropertyValue: (name: string): string => paletteVars[name] ?? "",
    }),
  };
  const mockDocument = {
    documentElement: {
      getAttribute: (name: string): string | null =>
        name === "data-theme" ? (opts.dataTheme ?? null) : null,
    },
  };

  // Append a return statement so we can extract the globals declared
  // inside the prelude's top-level scope.
  const wrapped = `
    ${src}
    return {
      parseHex,
      rgba,
      createRand,
      isLightMode,
      readPaletteFromCSS: typeof readPaletteFromCSS === "function" ? readPaletteFromCSS : () => ({}),
      C,
    };
  `;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function("window", "document", wrapped);
  return fn(mockWindow, mockDocument) as Sandbox;
}

describe("canvases/prelude", () => {
  describe("parseHex", () => {
    it("decodes a 6-digit hex string to [r, g, b]", () => {
      const { parseHex } = loadPrelude();
      expect(parseHex("#E87722")).toEqual([232, 119, 34]);
      expect(parseHex("#000000")).toEqual([0, 0, 0]);
      expect(parseHex("#FFFFFF")).toEqual([255, 255, 255]);
    });

    it("caches repeated lookups (returns same array reference)", () => {
      const { parseHex } = loadPrelude();
      const a = parseHex("#E87722");
      const b = parseHex("#E87722");
      expect(a).toBe(b);
    });
  });

  describe("rgba", () => {
    it("formats hex + alpha as an rgba() string", () => {
      const { rgba } = loadPrelude();
      expect(rgba("#E87722", 0.5)).toBe("rgba(232,119,34,0.5)");
    });

    it("clamps alpha to [0, 1]", () => {
      const { rgba } = loadPrelude();
      expect(rgba("#E87722", -0.5)).toBe("rgba(232,119,34,0)");
      expect(rgba("#E87722", 2.5)).toBe("rgba(232,119,34,1)");
    });
  });

  describe("createRand", () => {
    it("is deterministic for a given seed", () => {
      const { createRand } = loadPrelude();
      const a = createRand(42);
      const b = createRand(42);
      expect(a.next()).toBe(b.next());
      expect(a.next()).toBe(b.next());
    });

    it("range maps next() into [a, b)", () => {
      const { createRand } = loadPrelude();
      const r = createRand(7);
      for (let i = 0; i < 100; i++) {
        const v = r.range(5, 10);
        expect(v).toBeGreaterThanOrEqual(5);
        expect(v).toBeLessThan(10);
      }
    });
  });

  describe("isLightMode", () => {
    it('returns true when html[data-theme="light"]', () => {
      const { isLightMode } = loadPrelude({ dataTheme: "light" });
      expect(isLightMode()).toBe(true);
    });

    it("returns false when data-theme is dark or missing", () => {
      expect(loadPrelude({ dataTheme: "dark" }).isLightMode()).toBe(false);
      expect(loadPrelude().isLightMode()).toBe(false);
    });
  });

  describe("readPaletteFromCSS + C", () => {
    it("populates C from CSS custom properties when available (not the hardcoded fallback)", () => {
      // Use distinctive test values so we can tell the CSS values
      // actually reach C instead of the hardcoded fallback being used.
      const { C } = loadPrelude({
        paletteVars: {
          "--palette-amber": " #111111 ",
          "--palette-amber-light": "#222222",
          "--palette-amber-dark": "#333333",
          "--palette-amber-glow": "#444444",
          "--palette-purple": "#555555",
          "--palette-purple-light": "#666666",
          "--palette-purple-muted": "#777777",
          "--palette-white": "#888888",
          "--palette-bg-deep": "#999999",
        },
      });
      expect(C.AMBER).toBe("#111111"); // trimmed
      expect(C.AMBER_LT).toBe("#222222");
      expect(C.AMBER_DK).toBe("#333333");
      expect(C.GLOW).toBe("#444444");
      expect(C.PURPLE).toBe("#555555");
      expect(C.PURPLE_LT).toBe("#666666");
      expect(C.PURPLE_MU).toBe("#777777");
      expect(C.WHITE).toBe("#888888");
      expect(C.BG_DEEP).toBe("#999999");
    });

    it("falls back to hardcoded defaults when CSS vars are empty", () => {
      const { C } = loadPrelude({ paletteVars: {} });
      expect(C.AMBER).toBe("#E87722");
      expect(C.PURPLE).toBe("#6B2FA0");
      expect(C.WHITE).toBe("#FFFFFF");
    });

    it("always provides canvas-specific non-brand colors (WARM, CORE)", () => {
      // WARM + CORE are particle-effect colors that aren't in the CSS
      // brand palette at all — they should always be present with their
      // hardcoded defaults regardless of what CSS provides.
      const { C } = loadPrelude({
        paletteVars: { "--palette-amber": "#E87722" },
      });
      expect(C.WARM).toBe("#FFB366");
      expect(C.CORE).toBe("#FFF8EE");
    });
  });
});
