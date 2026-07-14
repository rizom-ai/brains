import type {
  SemanticEntityReference,
  SemanticSpaceNeighbor,
  SemanticSpaceOrigin,
  SemanticSpacePoint,
  SemanticSpaceProjection,
} from "./types";

const EPSILON = 1e-12;
const POWER_ITERATIONS = 100;

export interface SemanticEmbedding extends SemanticEntityReference {
  embedding: Float32Array;
}

export interface BuildSemanticSpaceOptions {
  origin?: SemanticEmbedding;
  maxNeighborDistance?: number;
}

/**
 * Build a provider-independent semantic projection from raw embeddings.
 * Raw vectors stay inside entity-service; callers receive only coordinates,
 * origin distances, and optional neighborhood relationships.
 */
export function buildSemanticSpaceProjection(
  inputs: SemanticEmbedding[],
  options: BuildSemanticSpaceOptions = {},
): SemanticSpaceProjection {
  if (
    options.maxNeighborDistance !== undefined &&
    (!Number.isFinite(options.maxNeighborDistance) ||
      options.maxNeighborDistance < 0 ||
      options.maxNeighborDistance > 2)
  ) {
    throw new RangeError("maxNeighborDistance must be between 0 and 2");
  }

  assertConsistentDimensions(inputs, options.origin);

  const normalized = inputs.map((input) => normalize(input.embedding));
  const normalizedOrigin = options.origin
    ? normalize(options.origin.embedding)
    : centroid(normalized);
  const coordinates = projectToTwoDimensions(normalized);
  const origin: SemanticSpaceOrigin = options.origin
    ? {
        kind: "entity",
        entityId: options.origin.entityId,
        entityType: options.origin.entityType,
      }
    : { kind: "centroid" };

  const points: SemanticSpacePoint[] = inputs.map((input, index) => ({
    entityId: input.entityId,
    entityType: input.entityType,
    coordinates: coordinates[index] ?? [0, 0],
    distanceToOrigin: cosineDistance(
      normalized[index] ?? new Float64Array(),
      normalizedOrigin,
    ),
  }));

  const distances = points.map((point) => point.distanceToOrigin);

  return {
    origin,
    points,
    neighbors: buildNeighbors(inputs, normalized, options.maxNeighborDistance),
    distanceRange: {
      min: distances.length > 0 ? Math.min(...distances) : 0,
      max: distances.length > 0 ? Math.max(...distances) : 0,
    },
  };
}

function assertConsistentDimensions(
  inputs: SemanticEmbedding[],
  origin?: SemanticEmbedding,
): void {
  const expected = inputs[0]?.embedding.length ?? origin?.embedding.length;
  if (expected === undefined) return;

  for (const input of inputs) {
    if (input.embedding.length !== expected) {
      throw new RangeError("Semantic embeddings must have matching dimensions");
    }
  }
  if (origin && origin.embedding.length !== expected) {
    throw new RangeError("Semantic origin must match point dimensions");
  }
}

function normalize(vector: Float32Array): Float64Array {
  let magnitudeSquared = 0;
  for (const value of vector) magnitudeSquared += value * value;
  const magnitude = Math.sqrt(magnitudeSquared);
  const result = new Float64Array(vector.length);
  if (magnitude <= EPSILON) return result;

  for (let index = 0; index < vector.length; index += 1) {
    result[index] = (vector[index] ?? 0) / magnitude;
  }
  return result;
}

function centroid(vectors: Float64Array[]): Float64Array {
  const dimensions = vectors[0]?.length ?? 0;
  const result = new Float64Array(dimensions);
  if (vectors.length === 0) return result;

  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      result[index] = (result[index] ?? 0) + (vector[index] ?? 0);
    }
  }

  let magnitudeSquared = 0;
  for (const value of result) magnitudeSquared += value * value;
  const magnitude = Math.sqrt(magnitudeSquared);
  if (magnitude <= EPSILON) return new Float64Array(dimensions);
  for (let index = 0; index < dimensions; index += 1) {
    result[index] = (result[index] ?? 0) / magnitude;
  }
  return result;
}

function cosineDistance(left: Float64Array, right: Float64Array): number {
  if (left.length === 0 || right.length === 0) return 1;

  let dot = 0;
  let leftMagnitudeSquared = 0;
  let rightMagnitudeSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitudeSquared += leftValue * leftValue;
    rightMagnitudeSquared += rightValue * rightValue;
  }
  if (leftMagnitudeSquared <= EPSILON || rightMagnitudeSquared <= EPSILON) {
    return 1;
  }

  const similarity = Math.max(
    -1,
    Math.min(1, dot / Math.sqrt(leftMagnitudeSquared * rightMagnitudeSquared)),
  );
  return 1 - similarity;
}

function buildNeighbors(
  inputs: SemanticEmbedding[],
  vectors: Float64Array[],
  maxDistance: number | undefined,
): SemanticSpaceNeighbor[] {
  if (maxDistance === undefined) return [];

  const neighbors: SemanticSpaceNeighbor[] = [];
  for (let sourceIndex = 0; sourceIndex < inputs.length; sourceIndex += 1) {
    for (
      let targetIndex = sourceIndex + 1;
      targetIndex < inputs.length;
      targetIndex += 1
    ) {
      const source = inputs[sourceIndex];
      const target = inputs[targetIndex];
      const sourceVector = vectors[sourceIndex];
      const targetVector = vectors[targetIndex];
      if (!source || !target || !sourceVector || !targetVector) continue;

      const distance = cosineDistance(sourceVector, targetVector);
      if (distance <= maxDistance) {
        neighbors.push({
          source: {
            entityId: source.entityId,
            entityType: source.entityType,
          },
          target: {
            entityId: target.entityId,
            entityType: target.entityType,
          },
          distance,
        });
      }
    }
  }
  return neighbors;
}

/**
 * PCA through the centered N×N Gram matrix. N is the number of entities and
 * is normally far smaller than the embedding dimension.
 */
function projectToTwoDimensions(
  vectors: Float64Array[],
): Array<[number, number]> {
  const count = vectors.length;
  if (count === 0) return [];
  if (count === 1) return [[0, 0]];

  const dimensions = vectors[0]?.length ?? 0;
  const means = new Float64Array(dimensions);
  for (const vector of vectors) {
    for (let index = 0; index < dimensions; index += 1) {
      means[index] = (means[index] ?? 0) + (vector[index] ?? 0) / count;
    }
  }

  const gram: number[][] = Array.from({ length: count }, () =>
    Array<number>(count).fill(0),
  );
  for (let row = 0; row < count; row += 1) {
    for (let column = row; column < count; column += 1) {
      let dot = 0;
      const left = vectors[row];
      const right = vectors[column];
      if (!left || !right) continue;
      for (let index = 0; index < dimensions; index += 1) {
        dot +=
          ((left[index] ?? 0) - (means[index] ?? 0)) *
          ((right[index] ?? 0) - (means[index] ?? 0));
      }
      const gramRow = gram[row];
      const gramColumn = gram[column];
      if (gramRow) gramRow[column] = dot;
      if (gramColumn) gramColumn[row] = dot;
    }
  }

  const eigenvectors: number[][] = [];
  const eigenvalues: number[] = [];
  for (let component = 0; component < 2; component += 1) {
    const eigenvector = powerIteration(gram, eigenvectors, component);
    if (!eigenvector) {
      eigenvectors.push(Array<number>(count).fill(0));
      eigenvalues.push(0);
      continue;
    }
    eigenvectors.push(eigenvector);
    eigenvalues.push(Math.max(0, rayleighQuotient(gram, eigenvector)));
  }

  return Array.from({ length: count }, (_, index) => [
    (eigenvectors[0]?.[index] ?? 0) * Math.sqrt(eigenvalues[0] ?? 0),
    (eigenvectors[1]?.[index] ?? 0) * Math.sqrt(eigenvalues[1] ?? 0),
  ]);
}

function powerIteration(
  matrix: number[][],
  priorVectors: number[][],
  component: number,
): number[] | null {
  const size = matrix.length;
  let vector = Array.from(
    { length: size },
    (_, index) =>
      Math.sin((index + 1) * (component + 1)) +
      Math.cos((index + 1) * (component + 2)),
  );
  vector = orthonormalize(vector, priorVectors);
  if (magnitude(vector) <= EPSILON) return null;

  for (let iteration = 0; iteration < POWER_ITERATIONS; iteration += 1) {
    const next = orthonormalize(multiply(matrix, vector), priorVectors);
    const nextMagnitude = magnitude(next);
    if (nextMagnitude <= EPSILON) return null;
    vector = next.map((value) => value / nextMagnitude);
  }

  const pivot = vector.reduce(
    (best, value, index) =>
      Math.abs(value) > Math.abs(vector[best] ?? 0) ? index : best,
    0,
  );
  if ((vector[pivot] ?? 0) < 0) {
    vector = vector.map((value) => -value);
  }
  return vector;
}

function multiply(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0),
  );
}

function orthonormalize(vector: number[], bases: number[][]): number[] {
  const result = [...vector];
  for (const base of bases) {
    const projection = result.reduce(
      (sum, value, index) => sum + value * (base[index] ?? 0),
      0,
    );
    for (let index = 0; index < result.length; index += 1) {
      result[index] = (result[index] ?? 0) - projection * (base[index] ?? 0);
    }
  }

  const resultMagnitude = magnitude(result);
  return resultMagnitude <= EPSILON
    ? result
    : result.map((value) => value / resultMagnitude);
}

function magnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function rayleighQuotient(matrix: number[][], vector: number[]): number {
  const product = multiply(matrix, vector);
  return vector.reduce(
    (sum, value, index) => sum + value * (product[index] ?? 0),
    0,
  );
}
