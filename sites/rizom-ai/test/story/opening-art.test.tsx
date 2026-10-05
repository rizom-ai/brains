/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OrganismArt } from "../../src/story/organism-art";

const css = readFileSync(join(import.meta.dir, "../../src/story.css"), "utf8");

describe("the opening's organism art", () => {
  test("draws one brain becoming a team and a network, each in its own light, joined by one thread", () => {
    const html = renderToStaticMarkup(<OrganismArt />);
    expect(html).toContain('<svg class="organism-defs" aria-hidden="true"');
    expect(html).toContain('id="org-thread"');
    expect(html).toContain('<svg class="organism-map" viewBox="0 0 1080 280"');
    expect(html).toContain('<use href="#org-brain" class="organism-brain"');
    expect(html).toContain('<use href="#org-team" class="organism-team"');
    expect(html).toContain('<use href="#org-network" class="organism-network"');
  });

  test("is styled by the story stylesheet in the three rooms' lights, running the full width of the opening under the words", () => {
    expect(css).toMatch(
      /\.opening__art \.organism-brain \{[^}]*color: var\(--palette-brass\);/,
    );
    expect(css).toMatch(
      /\.opening__art \.organism-team \{[^}]*color: var\(--palette-ruby-soft\);/,
    );
    expect(css).toMatch(
      /\.opening__art \.organism-network \{[^}]*color: var\(--palette-moss\);/,
    );
    expect(css).toMatch(
      /\.opening__art \.organism-ray \{[^}]*stroke: url\(#org-thread\);/,
    );
    expect(css).toMatch(
      /\.opening__art \{[^}]*width: calc\(\s*min\(100cqi, 80rem\) - 2 \* clamp\(1rem, 5vw, 5rem\)\s*\);/,
    );
    expect(css).toMatch(
      /\.opening__art > \.organism-map \{[^}]*width: 100%;[^}]*height: auto;/,
    );
  });
});
