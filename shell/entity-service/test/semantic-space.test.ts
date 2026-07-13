import { describe, expect, test } from "bun:test";
import {
  buildSemanticSpaceProjection,
  type SemanticEmbedding,
} from "../src/semantic-space";

function embedding(entityId: string, values: number[]): SemanticEmbedding {
  return {
    entityId,
    entityType: "agent",
    embedding: Float32Array.from(values),
  };
}

describe("semantic space projection math", () => {
  test("is deterministic", () => {
    const inputs = [
      embedding("one", [1, 0, 0]),
      embedding("two", [0.9, 0.1, 0]),
      embedding("three", [0, 1, 0]),
      embedding("four", [0, 0, 1]),
    ];

    expect(buildSemanticSpaceProjection(inputs)).toEqual(
      buildSemanticSpaceProjection(inputs),
    );
  });

  test("keeps every coordinate and distance finite for degenerate spaces", () => {
    const cases = [
      [],
      [embedding("one", [1, 0])],
      [embedding("one", [1, 0]), embedding("two", [1, 0])],
      [embedding("zero-one", [0, 0]), embedding("zero-two", [0, 0])],
    ];

    for (const inputs of cases) {
      const projection = buildSemanticSpaceProjection(inputs);
      for (const point of projection.points) {
        expect(point.coordinates.every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(point.distanceToOrigin)).toBe(true);
      }
    }
  });

  test("rejects incompatible dimensions and invalid neighbor thresholds", () => {
    expect(() =>
      buildSemanticSpaceProjection([
        embedding("one", [1, 0]),
        embedding("two", [1, 0, 0]),
      ]),
    ).toThrow("matching dimensions");

    expect(() =>
      buildSemanticSpaceProjection([embedding("one", [1, 0])], {
        maxNeighborDistance: 3,
      }),
    ).toThrow("between 0 and 2");
  });
});
