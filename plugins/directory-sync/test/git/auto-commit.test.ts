import { describe, it, expect, mock, beforeEach } from "bun:test";
import { setupGitAutoCommit } from "../../src/lib/git-auto-commit";
import { createSilentLogger } from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { IGitSync } from "../../src/types";
import { createMockGitSync } from "../fixtures";

/**
 * Minimal messaging mock that wires subscribe → send.
 * Calling send(channel, payload) invokes all handlers for that channel.
 */
function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

function createTestMessaging(): {
  messaging: ServicePluginContext["messaging"];
  channels: string[];
} {
  const subs = new Map<string, Array<(msg: unknown) => Promise<unknown>>>();
  const channels: string[] = [];

  const messaging = {
    subscribe: (
      channel: string,
      handler: (msg: unknown) => Promise<unknown>,
    ): (() => void) => {
      channels.push(channel);
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

  return { messaging, channels };
}

describe("setupGitAutoCommit", () => {
  let git: IGitSync;
  let commitMock: ReturnType<typeof mock>;
  let pushMock: ReturnType<typeof mock>;

  beforeEach(() => {
    commitMock = mock(async () => {});
    pushMock = mock(async () => {});
    git = createMockGitSync({ commit: commitMock, push: pushMock });
  });

  it("should subscribe to entity CRUD events", () => {
    const { messaging, channels } = createTestMessaging();
    setupGitAutoCommit(messaging, git, 50, createSilentLogger());

    expect(channels).toContain("entity:created");
    expect(channels).toContain("entity:updated");
    expect(channels).toContain("entity:deleted");
  });

  it("should commit and push after debounce", async () => {
    const { messaging } = createTestMessaging();
    setupGitAutoCommit(messaging, git, 50, createSilentLogger());

    await messaging.send({
      type: "entity:created",
      payload: {
        entity: {},
        entityType: "post",
        entityId: "1",
      },
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("should never commit before the debounce window", async () => {
    // The entity event fires before the auto-export subscriber has written
    // the file — an immediate (leading-edge) commit captures nothing and
    // strands the export as a dirty tree until the next periodic sync.
    const { messaging } = createTestMessaging();
    setupGitAutoCommit(messaging, git, 50, createSilentLogger());

    await messaging.send({
      type: "entity:created",
      payload: {
        entity: {},
        entityType: "post",
        entityId: "1",
      },
    });

    expect(commitMock).toHaveBeenCalledTimes(0);
    await new Promise((r) => setTimeout(r, 100));
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("should cancel a pending commit on cleanup", async () => {
    const { messaging } = createTestMessaging();
    const cleanup = setupGitAutoCommit(
      messaging,
      git,
      50,
      createSilentLogger(),
    );

    await messaging.send({
      type: "entity:created",
      payload: {
        entity: {},
        entityType: "post",
        entityId: "1",
      },
    });
    await messaging.send({
      type: "entity:updated",
      payload: {
        entity: {},
        entityType: "post",
        entityId: "2",
      },
    });

    cleanup();
    await new Promise((r) => setTimeout(r, 100));

    expect(commitMock).toHaveBeenCalledTimes(0);
  });

  it("currently returns from cleanup before an active commit and push settle", async () => {
    const { messaging } = createTestMessaging();
    const commitStarted = deferred();
    const releaseCommit = deferred();
    const pushFinished = deferred();
    const activePush = mock(async (): Promise<void> => {
      pushFinished.resolve();
    });
    const activeGit = createMockGitSync({
      commit: mock(async (): Promise<void> => {
        commitStarted.resolve();
        await releaseCommit.promise;
      }),
      push: activePush,
    });
    const cleanup = setupGitAutoCommit(
      messaging,
      activeGit,
      10,
      createSilentLogger(),
    );

    await messaging.send({
      type: "entity:created",
      payload: {
        entity: {},
        entityType: "post",
        entityId: "1",
      },
    });
    await commitStarted.promise;

    cleanup();
    expect(activePush).not.toHaveBeenCalled();

    releaseCommit.resolve();
    await pushFinished.promise;
    expect(activePush).toHaveBeenCalledTimes(1);
  });

  it("should batch rapid events into one commit", async () => {
    const { messaging } = createTestMessaging();
    setupGitAutoCommit(messaging, git, 50, createSilentLogger());

    for (let i = 0; i < 5; i++) {
      await messaging.send({
        type: "entity:updated",
        payload: {
          entity: {},
          entityType: "post",
          entityId: String(i),
        },
      });
    }

    await new Promise((r) => setTimeout(r, 100));

    expect(commitMock).toHaveBeenCalledTimes(1);
  });
});
