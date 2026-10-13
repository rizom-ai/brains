import { describe, expect, it } from "bun:test";
import {
  operatorKeyValuesBlockSchema,
  operatorNoticeBlockSchema,
  operatorStatsBlockSchema,
  operatorTextBlockSchema,
  type OperatorKeyValuesBlock,
  type OperatorNoticeBlock,
  type OperatorStatsBlock,
  type OperatorTextBlock,
} from "../src/operator/operator-view-contract";

/**
 * The leaf blocks' types are now the output of the schemas that validate
 * them, so these assert the two things that makes true: an author's literal
 * still type-checks, and the schema an author can now reach enforces the
 * bounds their type cannot show.
 */
describe("the derived leaf block types", () => {
  it("still accepts the literal an author would write", () => {
    const stats: OperatorStatsBlock = {
      type: "stats",
      items: [{ label: "Sessions", value: 3, tone: "good" }],
    };
    const text: OperatorTextBlock = { type: "text", text: "A paragraph." };
    const notice: OperatorNoticeBlock = {
      type: "notice",
      text: "Something to say.",
      details: ["One record", "Another"],
    };
    const keyValues: OperatorKeyValuesBlock = {
      type: "key-values",
      items: [{ label: "Host", value: null }],
    };

    expect(operatorStatsBlockSchema.parse(stats)).toEqual(stats);
    expect(operatorTextBlockSchema.parse(text)).toEqual(text);
    expect(operatorNoticeBlockSchema.parse(notice)).toEqual(notice);
    expect(operatorKeyValuesBlockSchema.parse(keyValues)).toEqual(keyValues);
  });

  it("gives an author a way to find a bound before shipping", () => {
    // The whole reason the schemas moved here. The derived type says
    // `label: string` and cannot say more — Zod erases refinements — so the
    // schema is what an author validates against in their own tests rather
    // than discovering the limit from a rejected view in production.
    const tooLong = {
      type: "stats" as const,
      items: [{ label: "x".repeat(200), value: 1 }],
    };

    const result = operatorStatsBlockSchema.safeParse(tooLong);
    expect(result.success).toBe(false);
  });

  it("refuses a block carrying a field the contract does not have", () => {
    // The blocks are strict, and that is load-bearing: a misspelled optional
    // field would otherwise be silently dropped rather than reported.
    const result = operatorTextBlockSchema.safeParse({
      type: "text",
      text: "A paragraph.",
      lable: "typo",
    });

    expect(result.success).toBe(false);
  });

  it("caps the collections each block will carry", () => {
    const tooManyStats = {
      type: "stats" as const,
      items: Array.from({ length: 21 }, (_, index) => ({
        label: `Stat ${index}`,
        value: index,
      })),
    };
    expect(operatorStatsBlockSchema.safeParse(tooManyStats).success).toBe(
      false,
    );

    const tooManyDetails = {
      type: "notice" as const,
      text: "Something to say.",
      details: Array.from({ length: 51 }, () => "A record"),
    };
    expect(operatorNoticeBlockSchema.safeParse(tooManyDetails).success).toBe(
      false,
    );
  });

  it("takes every scalar a key-value may hold, and nothing else", () => {
    const parse = (value: unknown): boolean =>
      operatorKeyValuesBlockSchema.safeParse({
        type: "key-values",
        items: [{ label: "Field", value }],
      }).success;

    expect(parse("text")).toBe(true);
    expect(parse(42)).toBe(true);
    expect(parse(true)).toBe(true);
    expect(parse(null)).toBe(true);
    // Undefined is absence, not a value; a nested object is a block's job.
    expect(parse(undefined)).toBe(false);
    expect(parse({ nested: true })).toBe(false);
  });
});
