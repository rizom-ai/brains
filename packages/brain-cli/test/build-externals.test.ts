import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Regression guard: `preact` and its subpaths MUST be listed in the
 * `sharedExternals` array of `packages/brain-cli/scripts/build.ts`.
 *
 * Why: Preact hooks rely on a module-level `options` global to bridge
 * component rendering and hook state. If `brain.js` and the library
 * exports (`site.js`, etc.) each bundle their OWN copy of preact,
 * and the consumer's site code brings ANOTHER copy via its own
 * package.json, hooks load their globals from one instance while
 * components render against another. The result is a hard crash deep
 * in the renderer, typically:
 *
 *    TypeError: undefined is not an object (evaluating 'D.context')
 *      at useContext (preact/hooks/dist/hooks.mjs:...)
 *
 * The only fix is to externalize preact so all three layers
 * (CLI bundle, library bundle, consumer code) resolve to the same
 * instance via the consumer's hoisted `node_modules/preact`.
 *
 * This was discovered booting the first standalone mylittlephoney
 * extraction. The dual
 * preact crashed the site build after `@-prefixed` package ref
 * resolution was fixed, revealing the next layer of the bug.
 *
 * Source check instead of a runtime check because the behavior
 * manifests only when a real consumer with its own preact renders
 * a real component — too expensive to reproduce in a unit test.
 * The source check catches exactly the regression shape: someone
 * removes preact from the externals list, thinking "it's small,
 * bundle it" and breaks every standalone instance.
 */
describe("brain-cli build config", () => {
  const buildScript = readFileSync(
    join(import.meta.dir, "..", "scripts", "build.ts"),
    "utf-8",
  );

  // Locate the `sharedExternals` array literal in the build script
  // and capture its contents. The regex is intentionally permissive
  // about whitespace/comments but strict about the variable name.
  const externalsMatch = buildScript.match(
    /const\s+sharedExternals\s*=\s*\[([\s\S]*?)\]/,
  );

  it("declares a sharedExternals array", () => {
    expect(externalsMatch).not.toBeNull();
  });

  const externalsBlock = externalsMatch?.[1] ?? "";

  it("externalizes preact (core)", () => {
    expect(externalsBlock).toMatch(/["']preact["']/);
  });

  it("externalizes preact/hooks", () => {
    expect(externalsBlock).toMatch(/["']preact\/hooks["']/);
  });

  it("externalizes preact/jsx-runtime", () => {
    expect(externalsBlock).toMatch(/["']preact\/jsx-runtime["']/);
  });

  it("externalizes preact/compat", () => {
    expect(externalsBlock).toMatch(/["']preact\/compat["']/);
  });

  it("externalizes preact-render-to-string", () => {
    expect(externalsBlock).toMatch(/["']preact-render-to-string["']/);
  });
});
