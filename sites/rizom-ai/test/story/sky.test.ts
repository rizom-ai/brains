import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Ask room's drawing is the brand's night sky (docs/plans/rizom-ask-network.md):
// Rizom the densest light, tendrils thinning outward, layered lights that
// breathe, dust for the brains not yet in reach, grain in the substrate. The
// radar's rings, spokes, pulse and sparks are gone.
const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");
const escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A rule's body, its whitespace collapsed, so a declaration reads as one line.
const rule = (selector: string): string =>
  (
    css.match(new RegExp(`(^|\\n)${escape(selector)} \\{([^}]*)\\}`))?.[2] ?? ""
  ).replace(/\s+/g, " ");
// A keyframes block, up to the next at-rule or top-level rule.
const frames = (name: string): string => {
  const from = css.indexOf(`@keyframes ${name} {`);
  if (from < 0) return "";
  const rest = css.slice(from + 1);
  const to = rest.search(/\n[@.[]/);
  return rest.slice(0, to < 0 ? undefined : to);
};

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

  test("sets the names as one quiet layer: lowercase, below every light, aligned inward at the edges", () => {
    expect(rule(".net-name")).toMatch(/text-transform: lowercase/);
    expect(rule(".net-name")).toMatch(
      /transform: translate\(-50%, [0-9.]+rem\)/,
    );
    expect(rule(".net-name--start")).toMatch(
      /transform: translate\(-0\.5rem, [0-9.]+rem\)/,
    );
    expect(rule(".net-name--end")).toMatch(
      /transform: translate\(calc\(-100% \+ 0\.5rem\), [0-9.]+rem\)/,
    );
    expect(css).not.toContain(".net-name--below");
    expect(css).not.toContain(".net-name--right");
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

describe("the sky's motion", () => {
  test("every light breathes on its own clock, set on its reply", () => {
    expect(rule(".net-halo")).toMatch(
      /animation: net-breathe var\(--net-breath, 7s\) ease-in-out var\(--net-phase, 0s\) infinite/,
    );
    expect(frames("net-breathe")).toMatch(
      /50% \{[^}]*transform: scale\(1\.18\)/,
    );
  });

  test("the whole sky drifts a degree over two minutes, and light seeps along the trunks", () => {
    expect(rule(".net-sky")).toMatch(
      /transform-origin: center;[^}]*animation: net-drift 140s ease-in-out infinite alternate/,
    );
    expect(frames("net-drift")).toMatch(
      /rotate\(-1\.1deg\)[^}]*\}[^}]*rotate\(1\.1deg\)/,
    );
    expect(rule(".net-seep")).toMatch(
      /animation: net-seep 26s linear infinite/,
    );
  });

  test("transfers take turns on a shared cycle: a bead travels a brain's route, its ripple and rim swell as it arrives", () => {
    expect(rule(".net-bead")).toMatch(
      /animation: net-travel 46\.8s linear var\(--net-turn, 0s\) infinite/,
    );
    expect(frames("net-travel")).toContain("offset-distance: 100%");
    expect(rule(".net-ripple")).toMatch(
      /animation: net-ripple 46\.8s linear var\(--net-turn, 0s\) infinite/,
    );
    expect(rule(".net-rim")).toMatch(
      /animation: net-swell 46\.8s ease-out var\(--net-turn, 0s\) infinite/,
    );
  });

  test("Rizom's embers circle and the dust twinkles", () => {
    expect(rule(".net-embers")).toMatch(
      /animation: net-turn 90s linear infinite/,
    );
    expect(rule(".net-embers circle")).toMatch(
      /animation: net-ember 5s ease-in-out var\(--net-phase, 0s\) infinite/,
    );
    expect(rule(".net-dust circle")).toMatch(
      /animation: net-dust var\(--net-breath, 20s\) ease-in-out var\(--net-phase, 0s\) infinite alternate/,
    );
    expect(rule(".net-lantern")).toMatch(
      /animation: net-lantern 4\.5s ease-in-out infinite/,
    );
  });

  test("an answer flares the cited lights, runs their bead once, and the sky holds still under the leads", () => {
    expect(rule(".net-layer .net-reply.is-lit .net-halo")).toMatch(
      /animation: net-answer 2\.4s ease-out 1 both, net-breathe 5s ease-in-out 2\.4s infinite/,
    );
    expect(rule(".net-layer .net-reply.is-lit .net-bead")).toMatch(
      /animation: net-travel-once 1\.6s ease-out 1 both/,
    );
    expect(css).toMatch(
      /\.net-layer\.has-replies \.net-sky,\n\.net-layer\.has-replies \.net-seep,\n\.net-layer\.has-replies \.net-embers,\n\.net-layer\.has-replies \.net-reply:not\(\.is-lit\) \.net-bead,\n\.net-layer\.has-replies \.net-reply:not\(\.is-lit\) \.net-ripple,\n\.net-layer\.has-replies \.net-reply:not\(\.is-lit\) \.net-rim \{\n {2}animation-play-state: paused;/,
    );
  });

  test("rests while an Asked-before question is read, and under reduced motion", () => {
    expect(css).toMatch(
      /\.story\.is-asked \.net-sky,\n\.story\.is-asked \.net-seep,\n\.story\.is-asked \.net-embers,\n\.story\.is-asked \.net-reply:not\(\.is-lit\) \.net-bead,\n\.story\.is-asked \.net-reply:not\(\.is-lit\) \.net-ripple,\n\.story\.is-asked \.net-reply:not\(\.is-lit\) \.net-rim \{\n {2}animation-play-state: paused;/,
    );
    const reduced = css.slice(
      css.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toMatch(
      /\.net-sky,[^{]*\.net-halo,[^{]*\.net-lantern \{\n {4}animation: none !important;/,
    );
    expect(reduced).toMatch(/\.net-bead \{\n {4}display: none;/);
  });
  test("on a phone the names stay out of the strip until an answer lights them, the un-lit ones even then", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 60rem)"));
    expect(phone).toMatch(
      /\.net-name,\n\s*\.net-layer\.has-replies \.net-name:not\(\.is-lit\) \{[^}]*opacity: 0;/,
    );
    expect(phone).toMatch(
      /\.net-layer\.has-replies \.net-name\.is-lit \{[^}]*opacity: 1;/,
    );
  });
});
