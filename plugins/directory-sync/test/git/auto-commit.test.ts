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
    send: async (channel: string, payload: unknown): Promise<unknown> => {
      const list = subs.get(channel) ?? [];
      for (const h of list) await h({ payload });
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

    await messaging.send("entity:created", {
      entity: {},
      entityType: "post",
      entityId: "1",
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("should commit immediately on first event (leading edge)", async () => {
    const { messaging } = createTestMessaging();
    setupGitAutoCommit(messaging, git, 200, createSilentLogger());

    await messaging.send("entity:created", {
      entity: {},
      entityType: "post",
      entityId: "1",
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it("should cancel trailing commit on cleanup", async () => {
    const { messaging } = createTestMessaging();
    const cleanup = setupGitAutoCommit(
      messaging,
      git,
      50,
      createSilentLogger(),
    );

    await messaging.send("entity:created", {
      entity: {},
      entityType: "post",
      entityId: "1",
    });
    await messaging.send("entity:updated", {
      entity: {},
      entityType: "post",
      entityId: "2",
    });

    cleanup();
    await new Promise((r) => setTimeout(r, 100));

    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it("should batch rapid events into one commit", async () => {
    const { messaging } = createTestMessaging();
    setupGitAutoCommit(messaging, git, 50, createSilentLogger());

    for (let i = 0; i < 5; i++) {
      await messaging.send("entity:updated", {
        entity: {},
        entityType: "post",
        entityId: String(i),
      });
    }

    await new Promise((r) => setTimeout(r, 100));

    expect(commitMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(commitMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
