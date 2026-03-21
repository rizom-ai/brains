import { describe, it, expect, mock, beforeEach } from "bun:test";
import { setupGitAutoCommit } from "../../src/lib/git-auto-commit";
import { createSilentLogger } from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { GitSync } from "../../src/lib/git-sync";

function createGitMock(): Pick<GitSync, "commit" | "push"> & {
  commit: ReturnType<typeof mock>;
  push: ReturnType<typeof mock>;
} {
  return {
    commit: mock(async () => {}),
    push: mock(async () => {}),
  };
}

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
  let git: ReturnType<typeof createGitMock>;

  beforeEach(() => {
    git = createGitMock();
  });

  it("should subscribe to entity CRUD events", () => {
    const { messaging, channels } = createTestMessaging();
    setupGitAutoCommit(
      messaging,
      git as unknown as GitSync,
      50,
      createSilentLogger(),
    );

    expect(channels).toContain("entity:created");
    expect(channels).toContain("entity:updated");
    expect(channels).toContain("entity:deleted");
  });

  it("should commit and push after debounce", async () => {
    const { messaging } = createTestMessaging();
    setupGitAutoCommit(
      messaging,
      git as unknown as GitSync,
      50,
      createSilentLogger(),
    );

    await messaging.send("entity:created", {
      entity: {},
      entityType: "post",
      entityId: "1",
    });
    await new Promise((r) => setTimeout(r, 100));

    expect(git.commit).toHaveBeenCalledTimes(1);
    expect(git.push).toHaveBeenCalledTimes(1);
  });

  it("should not commit before debounce fires", async () => {
    const { messaging } = createTestMessaging();
    setupGitAutoCommit(
      messaging,
      git as unknown as GitSync,
      200,
      createSilentLogger(),
    );

    await messaging.send("entity:created", {
      entity: {},
      entityType: "post",
      entityId: "1",
    });

    expect(git.commit).toHaveBeenCalledTimes(0);
  });
});
