import { expect, test } from "bun:test";
import { verifyReleaseCi, type ReleaseCiOperations } from "./release-ci";

const source = "b".repeat(40);
function run(
  id: number,
  head_sha = source,
  conclusion: string | null = "success",
  status = "completed",
  event = "push",
): object {
  return { id, head_sha, head_branch: "main", event, status, conclusion };
}
function scenario(
  batches: object[][],
  main = source,
): ReleaseCiOperations & { dispatchCount(): number } {
  let index = 0;
  let clock = 0;
  let dispatched = 0;
  return {
    runs: async () => ({ workflow_runs: batches[index++] ?? [] }),
    mainSha: async () => main,
    dispatch: async (): Promise<void> => {
      dispatched++;
    },
    wait: async (): Promise<void> => {
      clock++;
    },
    now: () => clock,
    dispatchCount: () => dispatched,
  };
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => undefined,
    (error: unknown) => error,
  );
}

test("an older successful SHA never approves the actual failing source", async () => {
  const operations = scenario([
    [run(1, "a".repeat(40)), run(2, source, "failure")],
  ]);
  expect(await failure(verifyReleaseCi(source, operations, 5))).toMatchObject({
    message: expect.stringContaining("concluded failure"),
  });
  expect(operations.dispatchCount()).toBe(0);
});
test("a version-only advance obtains CI for its actual source before release", async () => {
  const operations = scenario([
    [run(1, "a".repeat(40))],
    [run(2, source, null, "in_progress", "workflow_dispatch")],
    [run(2, source, "success", "completed", "workflow_dispatch")],
  ]);
  expect(await verifyReleaseCi(source, operations, 5)).toBe(2);
  expect(operations.dispatchCount()).toBe(1);
});
test("the newest run wins over an older success for the same SHA", async () => {
  const operations = scenario([[run(1), run(2, source, "cancelled")]]);
  expect(await failure(verifyReleaseCi(source, operations, 5))).toMatchObject({
    message: expect.stringContaining("concluded cancelled"),
  });
});
test("moving main cannot approve a dispatch for another SHA", async () => {
  const operations = scenario([[]], "c".repeat(40));
  expect(await failure(verifyReleaseCi(source, operations, 5))).toMatchObject({
    message: expect.stringContaining("main advanced"),
  });
  expect(operations.dispatchCount()).toBe(0);
});
test("pull-request runs are not release approvals and waiting is bounded", async () => {
  const operations = scenario([
    [run(1, source, "success", "completed", "pull_request")],
    [],
  ]);
  expect(await failure(verifyReleaseCi(source, operations, 2))).toMatchObject({
    message: expect.stringContaining("Timed out"),
  });
  expect(operations.dispatchCount()).toBe(1);
});
test("malformed run metadata fails closed", async () => {
  const operations = scenario([[{ id: 1 }]]);
  expect(await failure(verifyReleaseCi(source, operations, 2))).toBeInstanceOf(
    Error,
  );
  expect(operations.dispatchCount()).toBe(0);
});
