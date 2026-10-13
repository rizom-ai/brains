import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const require = createRequire(join(root, "package.json"));
const legacyLoaderRequire = createRequire(
  require.resolve("@esbuild-kit/core-utils"),
);

interface KatexRenderer {
  version: string;
  renderToString: (
    expression: string,
    options?: { trust?: boolean; throwOnError?: boolean },
  ) => string;
}

interface SelectorParser {
  (): { processSync: (selector: string) => string };
}

interface Transformed {
  code: string;
  map: unknown;
}

interface LegacyLoader {
  transformSync: (code: string, path: string) => Transformed;
  transform: (code: string, path: string) => Promise<Transformed>;
}

test("installed dependency paths use the reviewed patched versions", () => {
  const katex: KatexRenderer = require("katex");
  const typographyRequire = createRequire(
    require.resolve("@tailwindcss/typography"),
  );
  const parserPackage: { version: string } = typographyRequire(
    "postcss-selector-parser/package.json",
  );
  const legacyEsbuild: { version: string } = legacyLoaderRequire("esbuild");

  expect(katex.version).toBe("0.18.2");
  expect(parserPackage.version).toBe("7.1.6");
  // Check the actual installed child, not only a lockfile or audit result.
  expect(legacyEsbuild.version).toBe("0.25.12");
});

test("KaTeX ignores inherited trust without overriding explicit own trust", () => {
  const katex: KatexRenderer = require("katex");
  // Deliberately inherited options; never mutate Object.prototype.
  const options: { throwOnError: boolean } = Object.create({ trust: true });
  options.throwOnError = false;
  const expression = "\\href{javascript:alert(1)}{link}";

  expect(katex.renderToString(expression, options)).not.toContain(
    'href="javascript:alert(1)"',
  );
  expect(katex.renderToString(expression, { trust: true })).toContain(
    'href="javascript:alert(1)"',
  );
  expect(katex.renderToString("\\frac{1}{2} + \\sqrt{x}")).toContain(
    'class="katex"',
  );
});

test("the parser used by typography preserves flat and prose selectors", () => {
  const typographyRequire = createRequire(
    require.resolve("@tailwindcss/typography"),
  );
  const parser: SelectorParser = typographyRequire("postcss-selector-parser");
  const selectors = [
    ".a".repeat(40000),
    '.prose :where(p):not(:where([class~="not-prose"],[class~="not-prose"] *))',
    '.a#b[data-v="a,b"] > :is(.c, #d)::before',
  ];

  for (const selector of selectors) {
    expect(parser().processSync(selector)).toBe(selector);
  }
});

test("the legacy loader still transforms TypeScript synchronously and asynchronously", async () => {
  const loader: LegacyLoader = require("@esbuild-kit/core-utils");
  const source = "const value: number = 42; export { value };";
  const path = join(root, "scripts", "security-loader-probe.ts");
  const results = [
    loader.transformSync(source, path),
    await loader.transform(source, path),
  ];

  for (const result of results) {
    expect(result.code).toContain("42");
    expect(result.code).not.toContain(": number");
    expect(result.map).toBeTruthy();
  }
});
