import { describe, expect, it } from "bun:test";
import {
  operatorMeterBlockSchema,
  operatorProgressBlockSchema,
  type OperatorMeterBlock,
  type OperatorProgressBlock,
} from "../src/operator/operator-view-contract";

describe("the derived meter block", () => {
  it("still accepts the literal an author would write", () => {
    const block: OperatorMeterBlock = {
      type: "meters",
      id: "capacity",
      items: [{ id: "disk", label: "Disk", value: 40, max: 100, unit: "GB" }],
    };

    expect(operatorMeterBlockSchema.parse(block)).toEqual(block);
  });

  it("refuses a meter whose value exceeds its own maximum", () => {
    // The one rule here no type can carry: it relates two fields, so it is a
    // refinement and survives only in the schema.
    const result = operatorMeterBlockSchema.safeParse({
      type: "meters",
      id: "capacity",
      items: [{ id: "disk", label: "Disk", value: 120, max: 100 }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Meter value cannot exceed its maximum",
    );
    // Reported against the value, not the block, so an author is pointed at
    // the field they have to change.
    expect(result.error?.issues[0]?.path).toEqual(["items", 0, "value"]);
  });

  it("leaves a meter with no maximum unbounded", () => {
    const result = operatorMeterBlockSchema.safeParse({
      type: "meters",
      id: "capacity",
      items: [{ id: "requests", label: "Requests", value: 1_000_000 }],
    });

    expect(result.success).toBe(true);
  });

  it("takes zero but not a negative reading", () => {
    const parse = (value: number): boolean =>
      operatorMeterBlockSchema.safeParse({
        type: "meters",
        id: "capacity",
        items: [{ id: "disk", label: "Disk", value }],
      }).success;

    expect(parse(0)).toBe(true);
    expect(parse(-1)).toBe(false);
  });

  it("requires a block id, unlike the blocks that may go unnamed", () => {
    const result = operatorMeterBlockSchema.safeParse({
      type: "meters",
      items: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("the derived progress block", () => {
  it("still accepts the literal an author would write", () => {
    const block: OperatorProgressBlock = {
      type: "progress",
      id: "import",
      label: "Importing",
      state: "running",
      progress: 0.5,
      startedAt: "2026-09-21T10:00:00.000Z",
    };

    expect(operatorProgressBlockSchema.parse(block)).toEqual(block);
  });

  it("keeps progress within the unit interval", () => {
    const parse = (progress: number): boolean =>
      operatorProgressBlockSchema.safeParse({
        type: "progress",
        id: "import",
        label: "Importing",
        state: "running",
        progress,
      }).success;

    expect(parse(0)).toBe(true);
    expect(parse(1)).toBe(true);
    expect(parse(1.5)).toBe(false);
    expect(parse(-0.1)).toBe(false);
  });

  it("wants a real timestamp, not any string", () => {
    const result = operatorProgressBlockSchema.safeParse({
      type: "progress",
      id: "import",
      label: "Importing",
      state: "running",
      startedAt: "this morning",
    });

    expect(result.success).toBe(false);
  });
});
