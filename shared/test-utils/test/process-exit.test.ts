import { describe, expect, it } from "bun:test";
import { ProcessExited, expectProcessExit } from "../src/process-exit";

describe("expectProcessExit", () => {
  it("accepts an exit with the expected code", async () => {
    const settled = await expectProcessExit(
      Promise.reject(new ProcessExited(0)),
      0,
    ).then(() => "accepted");

    expect(settled).toBe("accepted");
  });

  it("reports the actual code when it differs", () => {
    expect(
      expectProcessExit(Promise.reject(new ProcessExited(1)), 0),
    ).rejects.toThrow("it exited with 1");
  });

  it("reports work that returned instead of exiting", () => {
    expect(expectProcessExit(Promise.resolve("done"), 0)).rejects.toThrow(
      "returned normally",
    );
  });

  it("rethrows an unrelated failure as itself", () => {
    expect(
      expectProcessExit(Promise.reject(new Error("database is down")), 0),
    ).rejects.toThrow("database is down");
  });
});
