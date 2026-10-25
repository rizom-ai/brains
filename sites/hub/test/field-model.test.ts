import { describe, expect, test } from "bun:test";
import {
  cloudPlace,
  nearestPairs,
  sceneAt,
  seedLights,
  stageFor,
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
