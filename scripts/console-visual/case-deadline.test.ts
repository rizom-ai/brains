import { describe, expect, it } from "bun:test";
import { withDeadline } from "./case-deadline";

describe("withDeadline", () => {
  it("returns the work's result when it finishes in time", async () => {
    expect(await withDeadline(Promise.resolve(42), 1_000, "quick case")).toBe(
      42,
    );
  });

  it("rejects with the case name when the work never settles", async () => {
    const hung = new Promise<never>(() => {});

    expect(withDeadline(hung, 20, "dashboard 1440x1000 paper")).rejects.toThrow(
      "dashboard 1440x1000 paper did not finish within 20ms",
    );
  });

  it("passes the work's own failure through", async () => {
    expect(
      withDeadline(Promise.reject(new Error("layout broke")), 1_000, "case"),
    ).rejects.toThrow("layout broke");
  });
});
