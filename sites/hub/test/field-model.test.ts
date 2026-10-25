import { describe, expect, test } from "bun:test";
import {
  bendPoint,
  certified,
  cloudPlace,
  cohortPhase,
  decisionsBy,
  departure,
  guestsPresent,
  holderInFocus,
  hubSites,
  hubsLit,
  labHome,
  labPhase,
  labWeek,
  linkNearest,
  memoryLevel,
  nearestPairs,
  onRecord,
  plantAt,
  sceneAt,
  seedLights,
  sparkPath,
  splitFlow,
  stageFor,
  type Light,
} from "../src/field/model";

describe("the field's lights", () => {
  test("are seeded, so the field lands the same way on every visit", () => {
    expect(seedLights(40, 11)).toEqual(seedLights(40, 11));
    expect(seedLights(40, 11)).not.toEqual(seedLights(40, 12));
  });

  test("each sit somewhere in the region, some of them warm", () => {
    const lights = seedLights(112, 11);
    expect(lights).toHaveLength(112);
    lights.forEach((light) => {
      expect(light.rad).toBeGreaterThanOrEqual(0);
      expect(light.rad).toBeLessThanOrEqual(1);
      expect(light.size).toBeGreaterThan(1);
    });
    const warm = lights.filter((light) => light.warm).length;
    expect(warm).toBeGreaterThan(10);
    expect(warm).toBeLessThan(50);
  });

  test("rank the warm ones first, the order the pipeline takes them in", () => {
    const lights = seedLights(112, 11);
    const ranks = lights.map((light) => light.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 112 }, (_, i) => i));
    const warm = lights.filter((light) => light.warm).length;
    lights.forEach((light) => {
      expect(light.rank < warm).toBe(light.warm);
    });
  });

  test("thread each light to its nearest neighbors, once per pair", () => {
    const lights = seedLights(60, 11);
    const pairs = nearestPairs(lights, 2);
    const keys = pairs.map(([a, b]) => `${a}-${b}`);
    expect(new Set(keys).size).toBe(keys.length);
    pairs.forEach(([a, b]) => expect(a).toBeLessThan(b));
    const touched = new Set(pairs.flat());
    expect(touched.size).toBe(60);
  });
});

describe("the stage", () => {
  test("stands beside the chapters on a wide screen, clear of the rail", () => {
    const stage = stageFor(1440, 900, null);
    expect(stage.phone).toBe(false);
    expect(stage.x0).toBeCloseTo(576);
    expect(stage.x1).toBe(1310);
    expect(stage.cx).toBeCloseTo((576 + 1310) / 2);
    expect(stage.R).toBeGreaterThan(0);
  });

  test("holds the top of a phone, ending above the chapter's card", () => {
    const stage = stageFor(390, 844, 500);
    expect(stage.phone).toBe(true);
    expect(stage.x0).toBe(0);
    expect(stage.x1).toBe(390);
    expect(stage.y1).toBe(486);
  });

  test("keeps a phone's drawing between two fifths and three fifths of the screen", () => {
    expect(stageFor(390, 1000, 100).y1).toBe(400);
    expect(stageFor(390, 1000, 900).y1).toBe(620);
    expect(stageFor(390, 1000, null).y1).toBe(546);
  });
});

describe("the chapter under the middle of the screen", () => {
  const boxes = [
    { top: 0, height: 1000 },
    { top: 1000, height: 2000 },
    { top: 3000, height: 1000 },
  ];

  test("is the last whose top has passed the middle", () => {
    expect(sceneAt(boxes, 0, 800).index).toBe(0);
    expect(sceneAt(boxes, 700, 800).index).toBe(1);
    expect(sceneAt(boxes, 2700, 800).index).toBe(2);
  });

  test("says how far through it the reader is", () => {
    expect(sceneAt(boxes, 600, 800)).toEqual({ index: 1, t: 0 });
    expect(sceneAt(boxes, 1600, 800)).toEqual({ index: 1, t: 0.5 });
    expect(sceneAt(boxes, 9000, 800)).toEqual({ index: 2, t: 1 });
  });

  test("is the first before the page has a chapter above the middle", () => {
    expect(sceneAt([{ top: 900, height: 500 }], 0, 800)).toEqual({
      index: 0,
      t: 0,
    });
  });
});

describe("the cloud", () => {
  const stage = stageFor(1440, 900, null);
  const lights = seedLights(112, 11);

  test("gathers the region around the stage's center", () => {
    lights.forEach((light) => {
      const [x, y] = cloudPlace(light, stage, 0, 1, true);
      expect(Math.abs(x - stage.cx)).toBeLessThan(stage.R * 1.5);
      expect(Math.abs(y - stage.cy)).toBeLessThan(stage.R * 1.2);
    });
  });

  test("drifts with time, and holds still for reduced motion", () => {
    const light = lights[3];
    if (!light) throw new Error("no light");
    expect(cloudPlace(light, stage, 0, 1, false)).not.toEqual(
      cloudPlace(light, stage, 4000, 1, false),
    );
    expect(cloudPlace(light, stage, 0, 1, true)).toEqual(
      cloudPlace(light, stage, 4000, 1, true),
    );
  });

  test("opens wider at a larger scale", () => {
    const light = lights[5];
    if (!light) throw new Error("no light");
    const [x1, y1] = cloudPlace(light, stage, 0, 1, true);
    const [x2, y2] = cloudPlace(light, stage, 0, 1.3, true);
    expect(Math.hypot(x2 - stage.cx, y2 - stage.cy)).toBeGreaterThan(
      Math.hypot(x1 - stage.cx, y1 - stage.cy),
    );
  });
});

describe("the pipeline", () => {
  const lights = seedLights(112, 11);
  const gone = (t: number): Light[] =>
    lights.filter((light) => departure(light.rank, lights.length, t) >= 1);

  test("takes nobody before the chapter starts", () => {
    expect(gone(0)).toHaveLength(0);
  });

  test("takes about half the region by the end, the warm ones first", () => {
    const left = gone(1);
    expect(left.length).toBeGreaterThan(lights.length * 0.4);
    expect(left.length).toBeLessThan(lights.length * 0.55);
    const warm = lights.filter((light) => light.warm);
    expect(gone(0.5).length).toBeGreaterThan(0);
    expect(gone(0.5).every((light) => light.warm)).toBe(true);
    expect(warm.every((light) => left.includes(light))).toBe(true);
  });

  test("lets each light leave over a stretch, not at once", () => {
    const halfway = lights.map((light) =>
      departure(light.rank, lights.length, 0.5),
    );
    expect(halfway.some((k) => k > 0 && k < 1)).toBe(true);
  });
});

describe("the cohorts", () => {
  test("arrive, stay and leave, one after another", () => {
    expect(cohortPhase(0, 3)).toMatchObject({
      c: 0,
      u: 0,
      arrive: 0,
      leave: 0,
    });
    expect(cohortPhase(0.5, 3)).toMatchObject({ c: 1, arrive: 1, leave: 0 });
    expect(cohortPhase(0.5, 3).u).toBeCloseTo(0.5);
    expect(cohortPhase(1, 3)).toMatchObject({ c: 2, u: 1, leave: 1 });
  });
});

describe("what the hub has on record", () => {
  const samples = Array.from({ length: 200 }, (_, i) => i / 199);

  test("builds with a Brain: each cohort starts where the last stopped", () => {
    const levels = samples.map((t) => memoryLevel(t, true));
    levels.slice(1).forEach((level, i) => {
      expect(level).toBeGreaterThanOrEqual((levels[i] ?? 0) - 1e-9);
    });
    expect(memoryLevel(1, true)).toBeCloseTo(4, 1);
    expect(onRecord(2, true)).toBe(28);
  });

  test("starts from zero without one", () => {
    expect(memoryLevel(0.249, false)).toBeLessThan(0.05);
    expect(memoryLevel(0.5, false)).toBeLessThan(0.05);
    expect(memoryLevel(0.15, false)).toBeGreaterThan(0.4);
    expect(
      Math.max(...samples.map((t) => memoryLevel(t, false))),
    ).toBeLessThanOrEqual(1);
    expect(onRecord(2, false)).toBe(0);
  });

  test("draws both lines for the sparkline", () => {
    const line = sparkPath(true);
    expect(line.startsWith("M8.0,62.0")).toBe(true);
    expect(line.split("L")).toHaveLength(121);
    expect(sparkPath(false)).not.toBe(line);
  });
});

describe("a bent thread", () => {
  test("runs from one end to the other", () => {
    expect(bendPoint(0, 0, 100, 0, 0.3, 0)).toEqual([0, 0]);
    expect(bendPoint(0, 0, 100, 0, 0.3, 1)).toEqual([100, 0]);
    expect(bendPoint(0, 0, 100, 0, 0, 0.5)).toEqual([50, 0]);
    expect(bendPoint(0, 0, 100, 0, 0.3, 0.5)[1]).toBeCloseTo(15);
  });
});

describe("a lab", () => {
  test("runs twenty-six weeks across the chapter, then goes home", () => {
    expect(labWeek(0)).toBe(0);
    expect(labWeek(0.47)).toBeCloseTo(13);
    expect(labWeek(0.95)).toBe(26);
    expect(labHome(0.8)).toBe(0);
    expect(labHome(1)).toBeCloseTo(1);
  });

  test("moves from the audit to the pilot, the Brain in use and the end", () => {
    expect(labPhase(1, 0)).toBe(0);
    expect(labPhase(3, 0)).toBe(1);
    expect(labPhase(17.9, 0)).toBe(1);
    expect(labPhase(18, 0)).toBe(2);
    expect(labPhase(24, 0)).toBe(3);
    expect(labPhase(10, 0.2)).toBe(3);
  });

  test("keeps a decision as it is made, from the audit to the end of the pilot", () => {
    expect(decisionsBy(2)).toBe(0);
    expect(decisionsBy(10)).toBe(11);
    expect(decisionsBy(18)).toBe(24);
    expect(decisionsBy(26)).toBe(24);
  });

  test("brings the hub's people in for the pilot only", () => {
    expect(guestsPresent(2)).toBe(0);
    expect(guestsPresent(10)).toBe(1);
    expect(guestsPresent(20)).toBe(0);
  });
});

describe("the holders", () => {
  test("light one by one as the chapter opens, then all together", () => {
    expect(holderInFocus(0.05, null)).toBe("orgs");
    expect(holderInFocus(0.15, null)).toBe("hub");
    expect(holderInFocus(0.25, null)).toBe("members");
    expect(holderInFocus(0.35, null)).toBe("bv");
    expect(holderInFocus(0.45, null)).toBe("foundation");
    expect(holderInFocus(0.6, null)).toBeNull();
  });

  test("follow the reader's choice over the scroll", () => {
    expect(holderInFocus(0.05, "foundation")).toBe("foundation");
    expect(holderInFocus(0.8, "bv")).toBe("bv");
  });

  test("let the money flow once each is known, delivery moving to the hub's people", () => {
    expect(splitFlow(0.4)).toBe(0);
    expect(splitFlow(0.7)).toBe(1);
    expect(certified(0.6)).toBe(0);
    expect(certified(1)).toBe(1);
  });
});

describe("the network", () => {
  test("places fourteen hubs across the stage, the same way every visit", () => {
    const sites = hubSites(14, 5);
    expect(sites).toHaveLength(14);
    expect(hubSites(14, 5)).toEqual(sites);
    sites.forEach(([u, v]) => {
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    });
  });

  test("lights hubs one after another until all fourteen are on", () => {
    expect(hubsLit(0)).toBe(1);
    expect(hubsLit(0.3)).toBeGreaterThan(1);
    expect(hubsLit(0.3)).toBeLessThan(14);
    expect(hubsLit(0.7)).toBe(14);
  });

  test("links each hub to its nearest neighbors, with no hub in the middle", () => {
    const points: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [10, 10],
      [11, 10],
    ];
    const links = linkNearest(points, 2);
    links.forEach(([a, b]) => expect(a).toBeLessThan(b));
    expect(new Set(links.map(([a, b]) => `${a}-${b}`)).size).toBe(links.length);
    expect(new Set(links.flat()).size).toBe(5);
    const degree = points.map(
      (_, i) => links.filter((l) => l.includes(i)).length,
    );
    expect(Math.max(...degree)).toBeLessThanOrEqual(4);
  });

  test("plants a hub where the reader taps the stage, and nowhere else", () => {
    const stage = stageFor(1440, 900, null);
    expect(plantAt(stage.cx, stage.cy, stage)).toEqual([0.5, 0.5]);
    expect(plantAt(100, 400, stage)).toBeNull();
  });
});
