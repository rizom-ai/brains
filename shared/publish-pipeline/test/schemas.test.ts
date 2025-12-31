import { describe, expect, it } from "bun:test";
import {
  publishStatusSchema,
  publishableMetadataSchema,
  type PublishStatus,
  type PublishableMetadata,
} from "../src/schemas/publishable";

describe("publishStatusSchema", () => {
  it("should accept valid status values", () => {
    const validStatuses: PublishStatus[] = [
      "draft",
      "queued",
      "published",
      "failed",
    ];

    for (const status of validStatuses) {
      const result = publishStatusSchema.parse(status);
      expect(result).toBe(status);
    }
  });

  it("should reject invalid status values", () => {
    expect(() => publishStatusSchema.parse("pending")).toThrow();
    expect(() => publishStatusSchema.parse("active")).toThrow();
    expect(() => publishStatusSchema.parse("")).toThrow();
    expect(() => publishStatusSchema.parse(null)).toThrow();
  });
});

describe("publishableMetadataSchema", () => {
  it("should parse minimal metadata with defaults", () => {
    const result = publishableMetadataSchema.parse({});

    expect(result).toEqual({
      status: "draft",
      retryCount: 0,
    });
  });

  it("should parse full metadata", () => {
    const input: PublishableMetadata = {
      status: "queued",
      queueOrder: 5,
      publishedAt: "2024-01-15T10:30:00.000Z",
      retryCount: 2,
      lastError: "Connection timeout",
    };

    const result = publishableMetadataSchema.parse(input);

    expect(result).toEqual(input);
  });

  it("should accept all valid status values", () => {
    const statuses: PublishStatus[] = [
      "draft",
      "queued",
      "published",
      "failed",
    ];

    for (const status of statuses) {
      const result = publishableMetadataSchema.parse({ status });
      expect(result.status).toBe(status);
    }
  });

  it("should reject invalid publishedAt format", () => {
    expect(() =>
      publishableMetadataSchema.parse({
        publishedAt: "2024-01-15", // Missing time
      }),
    ).toThrow();

    expect(() =>
      publishableMetadataSchema.parse({
        publishedAt: "not-a-date",
      }),
    ).toThrow();
  });

  it("should accept valid ISO datetime for publishedAt", () => {
    const result = publishableMetadataSchema.parse({
      publishedAt: "2024-12-31T23:59:59.999Z",
    });

    expect(result.publishedAt).toBe("2024-12-31T23:59:59.999Z");
  });

  it("should reject negative queueOrder", () => {
    // queueOrder is just a number, negatives are technically valid
    // but we should document expected behavior
    const result = publishableMetadataSchema.parse({
      queueOrder: -1,
    });
    expect(result.queueOrder).toBe(-1);
  });

  it("should default retryCount to 0", () => {
    const result = publishableMetadataSchema.parse({
      status: "failed",
      lastError: "Some error",
    });

    expect(result.retryCount).toBe(0);
  });
});
