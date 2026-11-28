import { describe, expect, it } from "bun:test";
import { summaryConfigSchema } from "../src";

describe("conversation memory's configuration", () => {
  it("picks up no insights unless a brain turns them on", () => {
    expect(summaryConfigSchema.parse({}).captureInsights).toBe(false);
    expect(
      summaryConfigSchema.parse({ captureInsights: true }).captureInsights,
    ).toBe(true);
  });
});
