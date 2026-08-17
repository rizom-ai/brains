import { describe, expect, it } from "bun:test";
import {
  GIT_OPERATIONS,
  parseGitOperationResult,
} from "../../../src/lib/broker/operations";
import type {
  GitOperationName,
  GitOperationResultMap,
} from "../../../src/lib/broker/operations";

/**
 * The result value is the last unchecked thing crossing the socket.
 *
 * Everything else in the protocol is a strict Zod contract; the result was
 * `unknown` widened by an assertion, which means a broker returning the wrong
 * shape produced a value the caller believed was typed. No cast may stand
 * between the socket and a typed value; parsing is what earns the type.
 */

const CHECKPOINT = {
  remoteFingerprint: "a".repeat(64),
  branch: "main",
  lastReconciledGitHead: "b".repeat(40),
};

const STATUS = {
  isRepo: true,
  hasChanges: false,
  ahead: 0,
  behind: 0,
  branch: "main",
  files: [],
};

describe("git operation results", () => {
  it("accepts what the executor actually returns, for every operation", () => {
    // Keyed by operation name, so a new operation cannot be added without a
    // sample here — the compiler enforces the coverage this test then checks.
    const answers: { [K in GitOperationName]: GitOperationResultMap[K] } = {
      initialize: undefined,
      commit: undefined,
      push: undefined,
      "has-local-changes": true,
      "show-file": "hello\n",
      "get-status": STATUS,
      "get-checkpoint": CHECKPOINT,
      "commit-and-push": { pushed: true, checkpoint: CHECKPOINT },
      pull: { files: ["a.md"], deletedFiles: [] },
      "get-reconciliation-delta": {
        mode: "full",
        checkpoint: CHECKPOINT,
        reason: "missing-checkpoint",
      },
      "log-file": [
        { sha: "c".repeat(40), date: "2026-01-01", message: "hello" },
      ],
    };

    for (const name of GIT_OPERATIONS) {
      expect(parseGitOperationResult(name, answers[name])).toEqual(
        answers[name],
      );
    }

    // The wire turns a void answer into null; it must still parse.
    expect(parseGitOperationResult("commit", null)).toBeUndefined();
  });

  it("rejects a result whose shape the caller would have trusted", () => {
    // Each of these would previously have been returned as a typed value.
    expect(() => parseGitOperationResult("has-local-changes", "yes")).toThrow();
    expect(() =>
      parseGitOperationResult("get-status", { isRepo: true }),
    ).toThrow();
    expect(() => parseGitOperationResult("log-file", "not-a-list")).toThrow();
    expect(() =>
      parseGitOperationResult("get-reconciliation-delta", {
        mode: "sideways",
        checkpoint: CHECKPOINT,
      }),
    ).toThrow();
    expect(() =>
      parseGitOperationResult("commit-and-push", { pushed: "maybe" }),
    ).toThrow();
  });

  it("treats a null checkpoint as the no-push outcome, not a missing one", () => {
    expect(
      parseGitOperationResult("commit-and-push", {
        pushed: false,
        checkpoint: null,
      }),
    ).toEqual({ pushed: false, checkpoint: null });
  });
});
