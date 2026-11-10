import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { FormReceipts } from "../src";

describe("a submission's receipt", () => {
  it("is opaque, and shows that submission's outcomes until it expires", async () => {
    let now = Date.parse("2026-11-07T10:00:00.000Z");
    const state = createPluginHarness().getMockShell().getRuntimeState();
    const receipts = new FormReceipts(
      state,
      "forms.quiz.receipts",
      600,
      () => now,
    );
    const outcomes = [{ dimension: "identity", outcome: "seeking" }];
    const receipt = await receipts.issue(outcomes);
    expect(receipt).toMatch(/^[a-f0-9]{64}$/);
    expect(
      JSON.stringify(
        await state
          .scoped({
            namespace: "forms.quiz.receipts",
            schema: (await import("@brains/utils/zod")).z.unknown(),
          })
          .get("receipts"),
      ),
    ).not.toContain(receipt);
    expect(await receipts.read(receipt)).toEqual(outcomes);
    expect(await receipts.read("f".repeat(64))).toBeNull();
    expect(await receipts.read("not a receipt")).toBeNull();
    now += 600_000;
    expect(await receipts.read(receipt)).toBeNull();
  });
});
