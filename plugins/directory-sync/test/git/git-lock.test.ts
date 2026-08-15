import { describe, it, expect, mock, afterEach } from "bun:test";
import { setupGitAutoCommit } from "../../src/lib/git-auto-commit";
import { setupPeriodicGitSync } from "../../src/lib/git-periodic-sync";
import { DirectorySyncRuntime } from "../../src/lib/directory-sync-runtime";
import {
  createSilentLogger,
  createMockServicePluginContext,
  waitUntil,
} from "@brains/test-utils";
import type { PullResult } from "../../src/lib/git-sync";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

describe("git operation serialization", () => {
  let runtime: DirectorySyncRuntime | undefined;

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
  });

  it("should not run auto-commit and periodic-sync git ops concurrently", async () => {
    let concurrentOps = 0;
    let maxConcurrent = 0;

    const trackConcurrency = async (delayMs: number): Promise<void> => {
      concurrentOps++;
      maxConcurrent = Math.max(maxConcurrent, concurrentOps);
      await Bun.sleep(delayMs);
      concurrentOps--;
    };

    const commitMock = mock(async () => trackConcurrency(50));
    const pushMock = mock(async () => trackConcurrency(50));
    const pullMock = mock(async (): Promise<PullResult> => {
      await trackConcurrency(50);
      return { files: ["a.md"] };
    });

    // Real lock implementation to test serialization
    let lockQueue: Promise<void> = Promise.resolve();
    const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
      let resolve: (() => void) | undefined;
      const next = new Promise<void>((r) => {
        resolve = r;
      });
      const prev = lockQueue;
      lockQueue = next;
      return prev.then(async () => {
        try {
          return await fn();
        } finally {
          resolve?.();
        }
      });
    };

    const git = createMockGitSync({
      commit: commitMock,
      push: pushMock,
      pull: pullMock,
      // commitAndPush gates on getStatus().hasChanges, not hasLocalChanges.
      // Without this the auto-commit returns early and never takes the lock,
      // so the concurrency assertion below only ever saw periodic syncs.
      getStatus: mock(async () => ({
        isRepo: true,
        hasChanges: true,
        ahead: 0,
        behind: 0,
        branch: "main",
        files: [],
      })),
      hasLocalChanges: mock(async () => true),
      withLock,
    });

    // Real messaging from the factory rather than a stand-in: auto-commit
    // subscribes through it and the test drives events with its send, so the
    // pub/sub path under test is the production one.
    const { messaging } = createMockServicePluginContext();
    runtime = new DirectorySyncRuntime();

    setupGitAutoCommit(messaging, git, 10, createSilentLogger(), runtime);
    setupPeriodicGitSync(
      git,
      createMockDirectorySync(),
      createMockServicePluginContext(),
      0.001,
      createSilentLogger(),
      runtime,
      {
        pullAndQueue: (options) =>
          options.gitSync.withLock(async () => {
            const pull = await options.gitSync.pull(options.signal);
            return {
              mode: "incremental",
              files: pull.files,
              deletedFiles: pull.deletedFiles ?? [],
              batch: null,
              checkpointAdvanced: false,
            };
          }),
      },
    );

    // Trigger auto-commit
    await messaging.send({
      type: "entity:created",
      payload: {
        entity: {},
        entityType: "post",
        entityId: "1",
      },
    });

    // Wait for the work itself rather than for a duration: the auto-commit and
    // several periodic syncs must actually have run before "they never
    // overlapped" means anything. A fixed sleep fits fewer operations on a
    // loaded machine and would weaken the assertion without failing.
    await waitUntil(
      () =>
        commitMock.mock.calls.length >= 1 && pullMock.mock.calls.length >= 3,
      "the auto-commit and three periodic syncs to run",
    );

    // Both halves must actually have run: a green "never overlapped" means
    // nothing if only one kind of operation ever took the lock.
    expect(commitMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalled();

    // Git operations should never overlap
    expect(maxConcurrent).toBe(1);
  });
});
