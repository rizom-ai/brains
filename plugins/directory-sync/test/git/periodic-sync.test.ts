import { describe, it, expect, mock, afterEach } from "bun:test";
import { setupPeriodicGitSync } from "../../src/lib/git-periodic-sync";
import { createSilentLogger } from "@brains/test-utils";
import type { GitSync, PullResult } from "../../src/lib/git-sync";
import type { DirectorySync } from "../../src/lib/directory-sync";
import type { ImportResult, SyncResult } from "../../src/types";

const emptyImport: ImportResult = {
  imported: 0,
  skipped: 0,
  failed: 0,
  quarantined: 0,
  quarantinedFiles: [],
  errors: [],
  jobIds: [],
};

const emptySyncResult: SyncResult = {
  import: emptyImport,
  export: { exported: 0, failed: 0, errors: [] },
  duration: 0,
};

describe("setupPeriodicGitSync", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it("should call pull and sync on each interval", async () => {
    const pullMock = mock(
      async (): Promise<PullResult> => ({ files: ["a.md"] }),
    );
    const syncMock = mock(async (): Promise<SyncResult> => emptySyncResult);
    const commitMock = mock(async () => {});
    const pushMock = mock(async () => {});

    cleanup = setupPeriodicGitSync(
      {
        pull: pullMock,
        commit: commitMock,
        push: pushMock,
      } as unknown as GitSync,
      { sync: syncMock } as unknown as DirectorySync,
      0.001, // interval in minutes (60ms)
      createSilentLogger(),
    );

    await new Promise((r) => setTimeout(r, 150));

    expect(pullMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(syncMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("should not start when intervalMinutes is 0", () => {
    const pullMock = mock(async (): Promise<PullResult> => ({ files: [] }));

    cleanup = setupPeriodicGitSync(
      { pull: pullMock } as unknown as GitSync,
      { sync: mock(async () => emptySyncResult) } as unknown as DirectorySync,
      0,
      createSilentLogger(),
    );

    expect(pullMock).not.toHaveBeenCalled();
  });

  it("should stop when cleanup is called", async () => {
    const pullMock = mock(async (): Promise<PullResult> => ({ files: [] }));

    cleanup = setupPeriodicGitSync(
      {
        pull: pullMock,
        commit: mock(async () => {}),
        push: mock(async () => {}),
      } as unknown as GitSync,
      { sync: mock(async () => emptySyncResult) } as unknown as DirectorySync,
      0.001,
      createSilentLogger(),
    );

    cleanup();

    const callsBefore = pullMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));

    expect(pullMock.mock.calls.length).toBe(callsBefore);
  });

  it("should skip commit+push when nothing changed", async () => {
    const pullMock = mock(async (): Promise<PullResult> => ({ files: [] }));
    const syncMock = mock(async (): Promise<SyncResult> => emptySyncResult);
    const commitMock = mock(async () => {});
    const pushMock = mock(async () => {});

    cleanup = setupPeriodicGitSync(
      {
        pull: pullMock,
        commit: commitMock,
        push: pushMock,
        hasLocalChanges: mock(async () => false),
      } as unknown as GitSync,
      { sync: syncMock } as unknown as DirectorySync,
      0.001,
      createSilentLogger(),
    );

    await new Promise((r) => setTimeout(r, 150));

    // Pull ran, but no remote changes + no local changes = skip commit+push
    expect(pullMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(commitMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("should not overlap cycles", async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const slowPull = mock(async (): Promise<PullResult> => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((r) => setTimeout(r, 80));
      concurrentCalls--;
      return { files: ["a.md"] };
    });

    cleanup = setupPeriodicGitSync(
      {
        pull: slowPull,
        commit: mock(async () => {}),
        push: mock(async () => {}),
        hasLocalChanges: mock(async () => false),
      } as unknown as GitSync,
      { sync: mock(async () => emptySyncResult) } as unknown as DirectorySync,
      0.001, // 60ms interval — faster than the 80ms pull
      createSilentLogger(),
    );

    await new Promise((r) => setTimeout(r, 300));

    // Should never have more than 1 concurrent cycle
    expect(maxConcurrent).toBe(1);
  });
});
