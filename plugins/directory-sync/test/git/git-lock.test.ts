import { describe, it, expect, mock, afterEach } from "bun:test";
import { setupGitAutoCommit } from "../../src/lib/git-auto-commit";
import { setupPeriodicGitSync } from "../../src/lib/git-periodic-sync";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { PullResult } from "../../src/lib/git-sync";
import { createMockDirectorySync, createMockGitSync } from "../fixtures";

function createTestMessaging(): {
  messaging: ServicePluginContext["messaging"];
} {
  const subs = new Map<string, Array<(msg: unknown) => Promise<unknown>>>();

  const messaging = {
    subscribe: (
      channel: string,
      handler: (msg: unknown) => Promise<unknown>,
    ): (() => void) => {
      const list = subs.get(channel) ?? [];
      list.push(handler);
      subs.set(channel, list);
      return (): void => {
        const arr = subs.get(channel);
        if (arr)
          subs.set(
            channel,
            arr.filter((h) => h !== handler),
          );
      };
    },
    send: async (request: {
      type: string;
      payload: unknown;
    }): Promise<unknown> => {
      const list = subs.get(request.type) ?? [];
      for (const h of list) await h({ payload: request.payload });
      return { success: true };
    },
  } as unknown as ServicePluginContext["messaging"];

  return { messaging };
}

describe("git operation serialization", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it("should not run auto-commit and periodic-sync git ops concurrently", async () => {
    let concurrentOps = 0;
    let maxConcurrent = 0;

    const trackConcurrency = async (delayMs: number): Promise<void> => {
      concurrentOps++;
      maxConcurrent = Math.max(maxConcurrent, concurrentOps);
      await new Promise((r) => setTimeout(r, delayMs));
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
      hasLocalChanges: mock(async () => true),
      withLock,
    });

    const { messaging } = createTestMessaging();

    cleanups.push(setupGitAutoCommit(messaging, git, 10, createSilentLogger()));
    cleanups.push(
      setupPeriodicGitSync(
        git,
        createMockDirectorySync(),
        createMockServicePluginContext(),
        0.001,
        createSilentLogger(),
      ),
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

    // Let both run for a while
    await new Promise((r) => setTimeout(r, 300));

    // Git operations should never overlap
    expect(maxConcurrent).toBe(1);
  });
});
