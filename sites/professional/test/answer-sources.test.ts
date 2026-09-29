import { describe, expect, it } from "bun:test";
import site from "../src";

// A visitor's answer cites what the atlas maps: essays, presentations and
// projects, the pieces that light up on it. Topics, series, links and social
// posts point back at those pieces and are never sources.
describe("the professional site's answer sources", () => {
  it("are its essays, presentations and projects", () => {
    const citable = Object.entries(site.entityDisplay)
      .filter(([, display]) => display.citable === true)
      .map(([entityType]) => entityType)
      .sort();
    expect(citable).toEqual(["deck", "post", "project"]);
  });
});
