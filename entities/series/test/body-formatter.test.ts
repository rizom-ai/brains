import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { createSeriesBodyFormatter, parseSeriesBody } from "../src";

describe("series body formatter", () => {
  const formatter = createSeriesBodyFormatter("Field Notes");

  it("round-trips a generated description", () => {
    expectBodyRoundTrip(formatter, {
      description: "A season of notes from the coast.",
    });
  });

  it("round-trips the empty body the adapter falls back to", () => {
    expectBodyRoundTrip(formatter, {});
  });
});

describe("parseSeriesBody", () => {
  it("reads the description from a series body", () => {
    expect(
      parseSeriesBody("Test", "# Test\n\n## Description\n\nSome description.")
        .description,
    ).toBe("Some description.");
  });

  it("answers empty for a body that is not a series body", () => {
    expect(parseSeriesBody("Test", "no sections here").description).toBe(
      undefined,
    );
  });
});
