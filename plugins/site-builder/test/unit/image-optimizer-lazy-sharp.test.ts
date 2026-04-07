import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Regression guard: sharp must never be imported at the top level of
 * `image-optimizer.ts`.
 *
 * Sharp's prebuilt native binaries depend on system libraries
 * (libstdc++, libc) that are not present at standard paths on NixOS,
 * Alpine, minimal containers, etc. A top-level `import sharp from
 * "sharp"` triggers native module resolution when the bundle loads,
 * which crashes the entire brain boot — even on instances that remove
 * the image plugin and never touch ImageOptimizer.
 *
 * Keeping sharp behind a dynamic `import("sharp")` isolates the
 * failure to the call sites that actually process images. See
 * `image-optimizer.ts` `loadSharp()` for the implementation.
 *
 * This test is a source check, not a runtime check. Source checks
 * are noisy but this one catches exactly the regression shape we
 * care about: someone adds `import sharp` back at the top to save a
 * few characters and breaks every minimal-linux brain instance.
 */
describe("ImageOptimizer source", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "src", "lib", "image-optimizer.ts"),
    "utf-8",
  );

  it("should not import sharp at the top level", () => {
    // Runtime value imports must not appear at top level.
    // `import sharp from "sharp"` or `import { ... } from "sharp"`.
    expect(source).not.toMatch(/^import\s+sharp\s+from\s+["']sharp["']/m);
    expect(source).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+["']sharp["']/m);
    expect(source).not.toMatch(
      /^import\s+\*\s+as\s+\w+\s+from\s+["']sharp["']/m,
    );
  });

  it("should lazy-load sharp via dynamic import", () => {
    expect(source).toMatch(/import\s*\(\s*["']sharp["']\s*\)/);
  });

  it("should keep the type-only import of sharp at the top level", () => {
    // `import type` is erased at compile time and does not trigger
    // the native module loader. It's fine to keep at the top level
    // for readable type annotations on the lazy loader.
    expect(source).toMatch(/^import\s+type\s+.*\s+from\s+["']sharp["']/m);
  });
});
