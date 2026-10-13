import { describe, expect, it } from "bun:test";
import { supervisorConclusion } from "../src/lib/shutdown-sequence";

const failure = { success: false, message: "worker died", exitCode: 1 };

describe("supervisorConclusion", () => {
  it("stays pending while any child is still running", () => {
    expect(supervisorConclusion(1, undefined, true)).toEqual({
      kind: "pending",
    });
    expect(supervisorConclusion(3, failure, true)).toEqual({ kind: "pending" });
  });

  it("resolves with the recorded failure once the children are gone", () => {
    expect(supervisorConclusion(0, failure, true)).toEqual({
      kind: "resolve",
      result: failure,
    });
  });

  it("prefers the recorded failure over the asked-for shutdown", () => {
    // A runtime that failed and was then told to stop still failed; reporting
    // success here would hide the reason it stopped from the exit code.
    const conclusion = supervisorConclusion(0, failure, true);
    expect(conclusion).toEqual({ kind: "resolve", result: failure });
  });

  it("succeeds when the shutdown was asked for and nothing failed", () => {
    expect(supervisorConclusion(0, undefined, true)).toEqual({
      kind: "resolve",
      result: { success: true },
    });
  });

  it("stays pending when the children are gone but nothing decided why", () => {
    // Not a success: no one asked for this and nothing recorded a failure, so
    // the outcome is still owed by whichever handler is mid-flight. Resolving
    // here would race that handler and report success for an unexplained exit.
    expect(supervisorConclusion(0, undefined, false)).toEqual({
      kind: "pending",
    });
  });
});
