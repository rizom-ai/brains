import { describe, expect, it, mock } from "bun:test";
import {
  createInterruptedPullRecovery,
  type InterruptedPullRecoveryStatus,
} from "../src/lib/interrupted-pull-recovery";

const RUN_ID = "interrupted-run";

function createStatus(): InterruptedPullRecoveryStatus & {
  observer: () => void;
} {
  const observer = mock(() => {});
  return {
    observer,
    markProgress: mock(async () => {}),
    createProgressObserver: mock(() => observer),
    finishInterruptedPull: mock(async () => {}),
  };
}

function createActive(): {
  status: ReturnType<typeof createStatus>;
  recovery: ReturnType<typeof createInterruptedPullRecovery>;
} {
  const status = createStatus();
  return {
    status,
    recovery: createInterruptedPullRecovery({
      operationStatus: status,
      interruptedPull: { id: RUN_ID },
      executionOnly: false,
    }),
  };
}

describe("interrupted pull recovery", () => {
  it("persists progress for the interrupted run", async () => {
    const { status, recovery } = createActive();

    await recovery.progress();

    expect(status.markProgress).toHaveBeenCalledWith(RUN_ID);
  });

  it("records a recovery during startup", async () => {
    const { status, recovery } = createActive();

    await recovery.succeeded("startup");

    expect(status.finishInterruptedPull).toHaveBeenCalledWith(RUN_ID, {
      recovered: true,
      message: "Recovered interrupted Git handoff during startup",
    });
  });

  it("records that recovery needs a configured repository", async () => {
    const { status, recovery } = createActive();

    await recovery.requiresRepository();

    expect(status.finishInterruptedPull).toHaveBeenCalledWith(RUN_ID, {
      recovered: false,
      message:
        "Interrupted Git handoff recovery requires a configured repository",
    });
  });

  it("returns a guarded step's result without settling the recovery", async () => {
    const { status, recovery } = createActive();

    expect(await recovery.guard(async () => "connected")).toBe("connected");
    expect(status.finishInterruptedPull).not.toHaveBeenCalled();
  });

  it("records a guarded step's failure and rethrows the same error", async () => {
    const { status, recovery } = createActive();
    const failure = new Error("socket refused");

    const thrown = await recovery
      .guard(async () => {
        throw failure;
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(thrown).toBe(failure);
    expect(status.finishInterruptedPull).toHaveBeenCalledWith(RUN_ID, {
      recovered: false,
      message: "Interrupted Git handoff recovery failed: socket refused",
    });
  });

  it("hands initial sync callbacks bound to the interrupted run", async () => {
    const { status, recovery } = createActive();

    const callbacks = recovery.initialSyncRecovery();
    if (!callbacks) throw new Error("Expected initial sync callbacks");
    await callbacks.onGitRecoverySucceeded();
    await callbacks.onGitRecoveryFailed(new Error("pull timed out"));

    expect(status.createProgressObserver).toHaveBeenCalledWith(RUN_ID);
    expect(callbacks.onGitProgress).toBe(status.observer);
    expect(status.finishInterruptedPull).toHaveBeenNthCalledWith(1, RUN_ID, {
      recovered: true,
      message: "Recovered interrupted Git handoff during initial sync",
    });
    expect(status.finishInterruptedPull).toHaveBeenNthCalledWith(2, RUN_ID, {
      recovered: false,
      message: "Interrupted Git handoff recovery failed: pull timed out",
    });
  });

  it.each([
    [
      "there is no interrupted pull",
      { interruptedPull: undefined, executionOnly: false },
    ],
    [
      "this process only executes jobs",
      { interruptedPull: { id: RUN_ID }, executionOnly: true },
    ],
  ] as const)("records nothing when %s", async (_scenario, options) => {
    const status = createStatus();
    const recovery = createInterruptedPullRecovery({
      operationStatus: status,
      ...options,
    });
    const failure = new Error("socket refused");

    await recovery.progress();
    await recovery.succeeded("startup");
    await recovery.requiresRepository();
    expect(await recovery.guard(async () => "connected")).toBe("connected");
    const thrown = await recovery
      .guard(async () => {
        throw failure;
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(thrown).toBe(failure);
    expect(recovery.initialSyncRecovery()).toBeUndefined();
    expect(status.markProgress).not.toHaveBeenCalled();
    expect(status.createProgressObserver).not.toHaveBeenCalled();
    expect(status.finishInterruptedPull).not.toHaveBeenCalled();
  });
});
