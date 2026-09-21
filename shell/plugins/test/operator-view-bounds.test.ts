import { describe, expect, it } from "bun:test";
import {
  operatorCoordinateSchema,
  operatorIdentifierSchema,
  operatorLabelSchema,
  operatorLongTextSchema,
  operatorRowIdentifierSchema,
  operatorShortTextSchema,
  operatorTextSchema,
} from "../src/operator/operator-view-contract";

/**
 * These are the bounds every operator view block is measured against, and
 * until now an author could only discover them by having a view rejected.
 * Each one is stated here so the limit is readable rather than inferred.
 */
describe("the operator view's shared bounds", () => {
  it("bounds an authored identifier to 1–120 characters, trimmed", () => {
    expect(operatorIdentifierSchema.parse("  panel-1  ")).toBe("panel-1");
    expect(operatorIdentifierSchema.safeParse("").success).toBe(false);
    expect(operatorIdentifierSchema.safeParse("   ").success).toBe(false);
    expect(operatorIdentifierSchema.safeParse("a".repeat(120)).success).toBe(
      true,
    );
    expect(operatorIdentifierSchema.safeParse("a".repeat(121)).success).toBe(
      false,
    );
  });

  it("bounds a row identifier more loosely, to 400", () => {
    // Row identity is opaque data rather than an authored name — a collection
    // row may be keyed by a composite source identity — so it gets more room
    // than the identifiers an author chooses.
    expect(operatorRowIdentifierSchema.safeParse("a".repeat(400)).success).toBe(
      true,
    );
    expect(operatorRowIdentifierSchema.safeParse("a".repeat(401)).success).toBe(
      false,
    );
    expect(operatorRowIdentifierSchema.safeParse("").success).toBe(false);
  });

  it("bounds a label to 1–160 characters, trimmed", () => {
    expect(operatorLabelSchema.parse("  Sessions  ")).toBe("Sessions");
    expect(operatorLabelSchema.safeParse("").success).toBe(false);
    expect(operatorLabelSchema.safeParse("a".repeat(160)).success).toBe(true);
    expect(operatorLabelSchema.safeParse("a".repeat(161)).success).toBe(false);
  });

  it("lets the text bounds be empty, and does not trim them", () => {
    // Unlike identifiers and labels, body text is content: empty is a
    // legitimate value and leading space may be meaningful.
    expect(operatorShortTextSchema.parse("")).toBe("");
    expect(operatorTextSchema.parse("  padded  ")).toBe("  padded  ");
  });

  it("gives each text bound its own ceiling", () => {
    expect(operatorShortTextSchema.safeParse("a".repeat(500)).success).toBe(
      true,
    );
    expect(operatorShortTextSchema.safeParse("a".repeat(501)).success).toBe(
      false,
    );
    expect(operatorTextSchema.safeParse("a".repeat(4_000)).success).toBe(true);
    expect(operatorTextSchema.safeParse("a".repeat(4_001)).success).toBe(false);
    expect(operatorLongTextSchema.safeParse("a".repeat(100_000)).success).toBe(
      true,
    );
    expect(operatorLongTextSchema.safeParse("a".repeat(100_001)).success).toBe(
      false,
    );
  });

  it("bounds a coordinate to the unit interval, ends included", () => {
    expect(operatorCoordinateSchema.parse(0)).toBe(0);
    expect(operatorCoordinateSchema.parse(1)).toBe(1);
    expect(operatorCoordinateSchema.safeParse(-0.01).success).toBe(false);
    expect(operatorCoordinateSchema.safeParse(1.01).success).toBe(false);
    // A view positioned at infinity has no position at all.
    expect(operatorCoordinateSchema.safeParse(Number.NaN).success).toBe(false);
    expect(
      operatorCoordinateSchema.safeParse(Number.POSITIVE_INFINITY).success,
    ).toBe(false);
  });
});
