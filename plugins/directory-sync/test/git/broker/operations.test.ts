import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GIT_OPERATIONS,
  gitOperationSchema,
  isMutatingOperation,
} from "../../../src/lib/broker/operations";
import type { GitOperation } from "../../../src/lib/broker/operations";

/**
 * Phase 2 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * The operation set is the ownership boundary, so it is pinned rather than
 * left to drift: every checkout-touching method callers have must map to an
 * operation, and nothing may reach Git outside one.
 */

describe("git operation contract", () => {
  it("covers every checkout-touching IGitSync method", async () => {
    const contract = await readFile(
      join(import.meta.dir, "../../../src/types/interfaces.ts"),
      "utf-8",
    );
    const block = contract.slice(contract.indexOf("export interface IGitSync"));
    const methods = [
      ...block.slice(0, block.indexOf("\n}")).matchAll(/^\s{2}(\w+)[<(]/gm),
    ].map((match) => match[1] ?? "");

    // `hasRemote` reads configuration rather than the checkout, and `cleanup`
    // is client lifecycle. `withLock` is deliberately absent: it is the lease
    // the plan forbids, and its sequencing moves inside operations.
    const clientSide = new Set(["hasRemote", "cleanup", "withLock"]);
    const needingOperations = methods.filter(
      (method) => method.length > 0 && !clientSide.has(method),
    );

    const covered: Record<string, GitOperation["name"]> = {
      initialize: "initialize",
      getStatus: "get-status",
      hasLocalChanges: "has-local-changes",
      commit: "commit",
      push: "push",
      pull: "pull",
      getReconciliationDelta: "get-reconciliation-delta",
      log: "log-file",
      show: "show-file",
    };

    expect(needingOperations.sort()).toEqual(Object.keys(covered).sort());
    expect(
      Object.values(covered).every((name) =>
        (GIT_OPERATIONS as readonly string[]).includes(name),
      ),
    ).toBe(true);
  });

  it("exposes no lease and no argument vector", () => {
    const asText = JSON.stringify(GIT_OPERATIONS);

    // A lease lets an application process hold the checkout across work the
    // broker cannot see; an argv escape hatch lets it compose a sequence the
    // broker cannot serialize. Neither may exist.
    expect(asText).not.toContain("lock");
    expect(asText).not.toContain("raw");
    expect(asText).not.toContain("exec");
  });

  it("accepts a well-formed operation and rejects an unknown one", () => {
    expect(
      gitOperationSchema.safeParse({ name: "commit", message: "hello" })
        .success,
    ).toBe(true);
    expect(gitOperationSchema.safeParse({ name: "gc" }).success).toBe(false);
    // No argv smuggled through a known operation.
    expect(
      gitOperationSchema.safeParse({ name: "commit", args: ["--amend"] })
        .success,
    ).toBe(false);
  });

  it("requires the arguments an operation cannot work without", () => {
    expect(gitOperationSchema.safeParse({ name: "log-file" }).success).toBe(
      false,
    );
    expect(
      gitOperationSchema.safeParse({ name: "show-file", sha: "abc" }).success,
    ).toBe(false);
    expect(
      gitOperationSchema.safeParse({
        name: "show-file",
        sha: "abc",
        filePath: "a.md",
      }).success,
    ).toBe(true);
  });

  it("marks exactly the operations that can change the checkout", () => {
    const mutating = GIT_OPERATIONS.filter((name) =>
      isMutatingOperation({ name } as GitOperation),
    );

    // Recovery may replay a read, never a mutation whose acknowledgement was
    // lost — so this list is what the journal must treat as ambiguous.
    expect([...mutating].sort()).toEqual([
      "commit",
      "initialize",
      "pull",
      "push",
    ]);
  });
});
