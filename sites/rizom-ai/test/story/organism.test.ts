import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { organism } from "../../src/story/organism";

// A brain that gathers two files, then joins a peer; a label per stage.
const drawing = organism({
  id: "spec",
  kinds: { L: "lantern", D0: "doc", D1: "doc", P: "" },
  stages: [
    { L: [300, 300, 12, 1] },
    { L: [300, 300, 12, 1], D0: [100, 200, 5, 1], D1: [100, 400, 5, 1] },
    { L: [300, 300, 12, 1], P: [500, 300, 6, 1], D0: [300, 300, 5, 0] },
  ],
  links: [
    ["d0", "D0", "L", 0],
    ["p", "L", "P", 0],
  ],
  visible: [[], ["d0"], ["p"]],
  flowing: [[], ["d0"], []],
  labels: [[], [[100, 440, "your files"]], [[500, 340, "a peer", "start"]]],
});

describe("organism", () => {
  test("draws every node once and places it at its first stage", () => {
    const svg = renderToStaticMarkup(drawing.svg());
    expect(svg.match(/id="spec-n-L"/g)).toHaveLength(1);
    expect(svg).toContain('id="spec-n-P"');
    expect(svg).toContain('class="o-lantern"');
    expect(svg.match(/class="o-doc"/g)).toHaveLength(2);
  });

  test("moves nodes between stages and hides a node where it is absent", () => {
    const css = drawing.css();
    expect(css).toContain(
      '.spec[data-stage="1"] #spec-n-D0 { --x: 100px; --y: 200px; opacity: 1;',
    );
    // Absent at stage 0: waits where it will appear, invisible.
    expect(css).toContain(
      '.spec[data-stage="0"] #spec-n-D0 { --x: 100px; --y: 200px; opacity: 0;',
    );
    // The peer joins at stage 2, and waits there beforehand.
    expect(css).toContain(
      '.spec[data-stage="1"] #spec-n-P { cx: 500px; cy: 300px; r: 0px; opacity: 0; }',
    );
  });

  test("shows a thread only in its stages, with a pulse where it flows", () => {
    const css = drawing.css();
    expect(css).toMatch(
      /\.spec\[data-stage="1"\] #spec-l-d0 \{ d: path\("M100 200 Q200 250 300 300"\); opacity: 1; stroke-dashoffset: 0; \}/,
    );
    expect(css).toMatch(
      /\.spec\[data-stage="0"\] #spec-l-d0 \{[^}]*opacity: 0; stroke-dashoffset: 1; \}/,
    );
    expect(css).toMatch(
      /\.spec\[data-stage="1"\] #spec-f-d0 \{[^}]*opacity: 1; \}/,
    );
    expect(css).toMatch(
      /\.spec\[data-stage="2"\] #spec-f-d0 \{[^}]*opacity: 0; \}/,
    );
  });

  test("sets labels as page text beside their place, shown per stage", () => {
    const svg = renderToStaticMarkup(drawing.svg());
    expect(svg).toContain(
      '<li class="o-name o-name--middle" style="left:16.7%;top:73.3%">your files</li>',
    );
    expect(svg).toContain('class="o-name o-name--start"');
    expect(drawing.css()).toContain(
      '.spec[data-stage="2"] .o-names[data-for="2"] { opacity: 1; }',
    );
  });
});
