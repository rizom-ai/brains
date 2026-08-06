import { describe, expect, it } from "bun:test";
import { OperationProvenanceSchema } from "../src";

describe("OperationProvenanceSchema", () => {
  it("accepts a JSON-safe projection lineage", () => {
    expect(
      OperationProvenanceSchema.parse({
        rootJobId: "root-1",
        causationId: "message-2",
        projectionId: "skill-derivation",
        projectionLineage: ["topics-projection", "skill-derivation"],
        sourceEntity: {
          entityType: "topic",
          entityId: "runtime-resilience",
          contentHash: "hash-1",
        },
        derivationDepth: 2,
      }),
    ).toEqual({
      rootJobId: "root-1",
      causationId: "message-2",
      projectionId: "skill-derivation",
      projectionLineage: ["topics-projection", "skill-derivation"],
      sourceEntity: {
        entityType: "topic",
        entityId: "runtime-resilience",
        contentHash: "hash-1",
      },
      derivationDepth: 2,
    });
  });

  it("requires depth and current projection to match the lineage", () => {
    expect(() =>
      OperationProvenanceSchema.parse({
        rootJobId: "root-1",
        causationId: "job-1",
        projectionId: "skill-derivation",
        projectionLineage: ["topics-projection"],
        derivationDepth: 2,
      }),
    ).toThrow();

    expect(() =>
      OperationProvenanceSchema.parse({
        rootJobId: "root-1",
        causationId: "job-1",
        projectionId: "skill-derivation",
        projectionLineage: ["topics-projection"],
        derivationDepth: 1,
      }),
    ).toThrow();
  });

  it("accepts a non-projection root operation", () => {
    expect(
      OperationProvenanceSchema.parse({
        rootJobId: "root-1",
        causationId: "root-1",
        projectionLineage: [],
        derivationDepth: 0,
      }),
    ).toEqual({
      rootJobId: "root-1",
      causationId: "root-1",
      projectionLineage: [],
      derivationDepth: 0,
    });
  });
});
