import { describe, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { createSeriesBodyFormatter } from "../src/schemas/series";

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
