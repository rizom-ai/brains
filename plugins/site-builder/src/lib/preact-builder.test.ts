import { describe, test, expect } from "bun:test";
import { PreactBuilder } from "./preact-builder";
import { createSilentLogger } from "@brains/test-utils";

describe("PreactBuilder - extractFontImports", () => {
  const logger = createSilentLogger("test");
  const builder = new PreactBuilder({
    logger,
    outputDir: "/tmp/out",
    workingDir: "/tmp/work",
  });

  test("extracts Google Font imports", () => {
    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
      body { font-family: Roboto; }
    `;

    // @ts-ignore - accessing private method for testing
    const result = builder.extractFontImports(css);

    expect(result.imports).toEqual([
      "@import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');",
    ]);
    expect(result.cssWithoutImports.trim()).toBe(
      "body { font-family: Roboto; }",
    );
  });

  test("handles complex font URLs with multiple families", () => {
    const css = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');`;

    // @ts-ignore - accessing private method for testing
    const result = builder.extractFontImports(css);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toContain("Bebas+Neue");
    expect(result.imports[0]).toContain("Space+Mono");
  });

  test("ignores non-font imports", () => {
    const css = `
      @import "tailwindcss";
      @import url('some-other-file.css');
      body { color: red; }
    `;

    // @ts-ignore - accessing private method for testing
    const result = builder.extractFontImports(css);

    expect(result.imports).toEqual([]);
    expect(result.cssWithoutImports).toContain('@import "tailwindcss"');
  });

  test("extracts fonts.gstatic.com imports", () => {
    const css = `@import url('https://fonts.gstatic.com/s/roboto/v30/font.woff2');`;

    // @ts-ignore - accessing private method for testing
    const result = builder.extractFontImports(css);

    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]).toContain("fonts.gstatic.com");
  });
});
