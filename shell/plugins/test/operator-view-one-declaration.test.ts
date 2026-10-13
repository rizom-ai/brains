import { describe, expect, it } from "bun:test";
import {
  operatorMeterBlockSchema,
  operatorStatsBlockSchema,
  type OperatorMeterBlock,
  type OperatorNoticeBlock,
  type OperatorScalar,
  type OperatorStatsBlock,
  type OperatorTextBlock,
  type OperatorTone,
} from "../src/operator/operator-view-contract";
import type {
  RuntimeOperatorMeterBlock,
  RuntimeOperatorNoticeBlock,
  RuntimeOperatorScalar,
  RuntimeOperatorStatsBlock,
  RuntimeOperatorTextBlock,
  RuntimeOperatorTone,
} from "../src/operator/operator-view-runtime";

/**
 * The author-facing and renderer-facing names are now one declaration.
 *
 * A plugin writes an OperatorStatsBlock; studio and dashboard render a
 * RuntimeOperatorStatsBlock. They were two hand-written interfaces that
 * happened to agree. These assignments compile only while they are the same
 * type, so the agreement is checked rather than maintained.
 */
describe("one declaration, two names", () => {
  it("holds for every leaf block", () => {
    const stats: OperatorStatsBlock = {
      type: "stats",
      items: [{ label: "Sessions", value: 3 }],
    };
    const asRuntimeStats: RuntimeOperatorStatsBlock = stats;
    const backAgain: OperatorStatsBlock = asRuntimeStats;
    expect(backAgain).toBe(stats);

    const text: OperatorTextBlock = { type: "text", text: "A paragraph." };
    const asRuntimeText: RuntimeOperatorTextBlock = text;
    expect(asRuntimeText.type).toBe("text");

    const notice: OperatorNoticeBlock = { type: "notice", text: "Heads up." };
    const asRuntimeNotice: RuntimeOperatorNoticeBlock = notice;
    expect(asRuntimeNotice.type).toBe("notice");

    const meters: OperatorMeterBlock = {
      type: "meters",
      id: "capacity",
      items: [{ id: "disk", label: "Disk", value: 40 }],
    };
    const asRuntimeMeters: RuntimeOperatorMeterBlock = meters;
    expect(asRuntimeMeters.id).toBe("capacity");
  });

  it("holds for the scalars and tones they are built from", () => {
    const tone: OperatorTone = "warn";
    const asRuntimeTone: RuntimeOperatorTone = tone;
    expect(asRuntimeTone).toBe("warn");

    const scalar: OperatorScalar = null;
    const asRuntimeScalar: RuntimeOperatorScalar = scalar;
    expect(asRuntimeScalar).toBeNull();
  });

  it("parses an authored block into the very type that was authored", () => {
    // The point of the collapse: what comes back out of validation is the
    // same type that went in, so nothing has to be converted between them.
    const authored: OperatorStatsBlock = {
      type: "stats",
      items: [{ label: "Sessions", value: 3, tone: "good" }],
    };

    const parsed: RuntimeOperatorStatsBlock =
      operatorStatsBlockSchema.parse(authored);

    expect(parsed).toEqual(authored);
  });

  it("still enforces the meter rule through the runtime name", () => {
    const parsed = operatorMeterBlockSchema.safeParse({
      type: "meters",
      id: "capacity",
      items: [{ id: "disk", label: "Disk", value: 120, max: 100 }],
    });

    expect(parsed.success).toBe(false);
  });
});
