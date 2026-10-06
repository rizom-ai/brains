import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Ask room's drawing is the brand's night sky (docs/plans/rizom-ask-network.md):
// Rizom the densest light, tendrils thinning outward, layered lights that
// breathe, dust for the brains not yet in reach, grain in the substrate. The
// radar's rings, spokes, pulse and sparks are gone.
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const rule = (selector: string): string =>
  css.match(
    new RegExp(
      `(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`,
    ),
  )?.[2] ?? "";

describe("the sky's drawing", () => {
  test("layers each light: a halo and an ember rim from gradients, the mark's core by kind", () => {
    expect(rule(".net-halo")).toContain("fill: url(#net-halo)");
    expect(rule(".net-rim")).toContain("fill: url(#net-rim)");
    expect(rule(".net-mark i")).toMatch(/background: var\(--color-text\)/);
    expect(rule('.net-mark[data-kind="team"] i')).toMatch(
      /background: var\(--color-bg\)/,
    );
    expect(rule('.net-mark[data-kind="team"] i')).toMatch(
      /border: [0-9.]+px solid var\(--color-text\)/,
    );
    expect(rule('.net-mark[data-kind="organization"] i')).toMatch(
      /border-style: dotted/,
    );
  });

  test("names a right-edge brain below its light", () => {
    expect(rule(".net-name--below")).toMatch(
      /transform: translate\(-50%, [0-9.]+rem\)/,
    );
  });

  test("grows tendrils that thin and dim outward, with a seep of light along the trunk", () => {
    expect(rule(".net-trunk")).toMatch(
      /stroke-width: 0\.5[0-9]*;[^}]*stroke-opacity: 0\.2[0-9]*/,
    );
    expect(rule(".net-thread")).toMatch(
      /stroke-width: 0\.2[0-9]*;[^}]*stroke-opacity: 0\.[12][0-9]*/,
    );
    expect(rule(".net-seep")).toMatch(/stroke-dasharray: 0\.6 7/);
  });

  test("lays the substrate: a purple boundary, Rizom's wash and corona, dust and grain", () => {
    expect(rule(".net-boundary")).toContain("fill: url(#net-boundary)");
    expect(rule(".net-wash")).toContain("fill: url(#net-wash)");
    expect(rule(".net-corona")).toContain("fill: url(#net-corona)");
    expect(rule(".net-dust circle")).toMatch(/fill: var\(--net-lilac\)/);
    expect(rule(".net-grain")).toMatch(
      /fill: url\(#net-grain-fill\);[^}]*opacity: 0\.0[0-9]+;[^}]*mix-blend-mode: screen/,
    );
  });

  test("has no radar left: no rings, no pulse, no echo, no spark, no dashed corona", () => {
    for (const old of [
      ".net-ring",
      ".net-pulse",
      ".net-echo",
      ".net-spark",
      ".net-corona--outer",
      "@keyframes net-pulse",
      "@keyframes net-flare",
    ]) {
      expect(css).not.toContain(old);
    }
  });
});
