import { describe, expect, it } from "bun:test";
import { constellationEcho, loneEcho } from "../src/lib/radar-echoes";

const points = (path: string): Array<[number, number]> =>
  [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);

describe("radar echoes", () => {
  const ada = { id: "ada", x: 30, y: 60 };
  const partner = { id: "partner", x: 50, y: 75 };

  it("stacks a constellation's lines around its agents and the thread between them", () => {
    const echo = constellationEcho(
      [ada, partner],
      [{ from: "ada", to: "partner" }],
    );
    expect(echo).toHaveLength(6);
    for (const path of echo) expect(path).not.toBe("");
    // The outermost line surrounds both agents.
    const outer = points(echo[0] ?? "");
    const xs = outer.map(([x]) => x);
    const ys = outer.map(([, y]) => y);
    expect(Math.min(...xs)).toBeLessThan(ada.x);
    expect(Math.max(...xs)).toBeGreaterThan(partner.x);
    expect(Math.min(...ys)).toBeLessThan(ada.y);
    expect(Math.max(...ys)).toBeGreaterThan(partner.y);
  });

  it("gives a lone agent a small island of rings", () => {
    const island = loneEcho(ada, false);
    expect(island).toHaveLength(3);
    for (const [x, y] of points(island.join(""))) {
      expect(Math.hypot(x - ada.x, y - ada.y)).toBeLessThan(12);
    }
    expect(loneEcho(ada, true)).toHaveLength(2);
  });

  it("draws the same echo every build", () => {
    const links = [{ from: "ada", to: "partner" }];
    expect(constellationEcho([ada, partner], links)).toEqual(
      constellationEcho([ada, partner], links),
    );
  });
});
