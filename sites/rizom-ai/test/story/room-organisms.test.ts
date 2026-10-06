import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { brainOrganism } from "../../src/story/brain-organism";
import { livingOrganism } from "../../src/story/living-organism";
import { workOrganism } from "../../src/story/work-organism";

describe("the room drawings", () => {
  test("the homepage drawing grows its first team out of the centre point, where the opening's network gathers", () => {
    const css = livingOrganism.css();
    // Before the science, the team waits at the centre, unseen; the science
    // sends it out to its corners, so the pyramid opens from the point the
    // network drew into. Back up the page, it closes into the point again.
    expect(css).toContain(
      '.living-org[data-stage="0"] #living-org-n-T1 { cx: 300px; cy: 300px; r: 0px; opacity: 0; }',
    );
    expect(css).toContain(
      '.living-org[data-stage="0"] #living-org-n-T3 { cx: 300px; cy: 300px; r: 0px; opacity: 0; }',
    );
    expect(css).toContain(
      '.living-org[data-stage="1"] #living-org-n-T1 { cx: 300px; cy: 165px; r: 6px; opacity: 1; }',
    );
  });

  test("the Brain's drawing grows from one lantern through six stages", () => {
    expect(brainOrganism.stageCount).toBe(6);
    const svg = renderToStaticMarkup(brainOrganism.svg());
    expect(svg.match(/class="o-lantern"/g)).toHaveLength(1);
    expect(svg.match(/class="o-doc"/g)).toHaveLength(8);
    const css = brainOrganism.css();
    // The files gather into the brain, then ring it at the end.
    expect(css).toContain('.brain-org[data-stage="1"] #brain-org-n-D0');
    expect(css).toContain('.brain-org[data-stage="5"] #brain-org-n-D0');
    // The peers light at the collective and stay, faint, after.
    expect(css).toMatch(
      /\.brain-org\[data-stage="4"\] #brain-org-n-P0 \{[^}]*opacity: 1;/,
    );
    expect(css).toMatch(
      /\.brain-org\[data-stage="5"\] #brain-org-n-P0 \{[^}]*opacity: 0\.25;/,
    );
    expect(svg).toContain("your team");
    expect(svg).toContain("a light on the map");
  });

  test("the Work drawing takes a team from confusion to its map through six stages", () => {
    expect(workOrganism.stageCount).toBe(6);
    const svg = renderToStaticMarkup(workOrganism.svg());
    expect(svg.match(/class="o-node hollow"/g)).toHaveLength(1);
    expect(svg).toContain("the same work, three times");
    expect(svg).toContain("a half-day in the room");
    const css = workOrganism.css();
    // AI has no place in the team at the opening, and a place on the map.
    expect(css).toMatch(
      /\.work-org\[data-stage="0"\] #work-org-n-AI \{[^}]*opacity: 1;/,
    );
    expect(css).toMatch(
      /\.work-org\[data-stage="2"\] #work-org-n-AI \{[^}]*opacity: 0;/,
    );
    expect(css).toMatch(
      /\.work-org\[data-stage="4"\] #work-org-n-AI \{[^}]*opacity: 1;/,
    );
  });
});
