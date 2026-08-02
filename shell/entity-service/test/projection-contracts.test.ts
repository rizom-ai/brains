import { describe, expect, it } from "bun:test";
import { ProjectionWriteIntentSchema } from "../src";

describe("projection persistence contracts", () => {
  it("accepts stable upserts and rejects non-JSON memo output", () => {
    expect(
      ProjectionWriteIntentSchema.parse({
        operation: "upsert",
        entity: {
          id: "topic-1",
          entityType: "topic",
          content: "content",
          metadata: { score: 0.8 },
          visibility: "public",
        },
      }).operation,
    ).toBe("upsert");

    expect(() =>
      ProjectionWriteIntentSchema.parse({
        operation: "upsert",
        entity: {
          id: "topic-1",
          entityType: "topic",
          content: "content",
          metadata: { callback: () => undefined },
          visibility: "public",
        },
      }),
    ).toThrow();
  });
});
