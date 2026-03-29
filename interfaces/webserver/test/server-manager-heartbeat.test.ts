import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { ServerManager } from "../src/server-manager";

/**
 * These tests verify the ServerManager configures IPC and heartbeats
 * by intercepting Bun.spawn. We don't actually spawn a child process.
 */
describe("ServerManager heartbeat", () => {
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: Array<{ args: unknown[]; options: Record<string, unknown> }>;
  let sentMessages: unknown[];
  let mockSubprocess: {
    send: (msg: unknown) => void;
    kill: () => void;
    pid: number;
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
  };

  beforeEach(() => {
    spawnCalls = [];
    sentMessages = [];
    originalSpawn = Bun.spawn;

    // Create a readable stream that immediately signals WEBSERVER_READY
    const readyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("WEBSERVER_READY\n"));
        controller.close();
      },
    });

    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });

    mockSubprocess = {
      send: mock((msg: unknown) => {
        sentMessages.push(msg);
      }),
      kill: mock(() => {}),
      pid: 12345,
      stdout: readyStream,
      stderr: emptyStream,
    };

    // @ts-expect-error — replacing Bun.spawn with a mock
    Bun.spawn = mock((...args: unknown[]) => {
      const options = args[1] ?? args[0];
      spawnCalls.push({
        args: Array.isArray(args[0]) ? args[0] : [],
        options: options as Record<string, unknown>,
      });
      return mockSubprocess;
    });
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
  });

  it("should spawn with ipc option", async () => {
    const manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: "/tmp/dist",
      sharedImagesDir: "/tmp/images",
      productionPort: 8080,
    });

    await manager.start();

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.options).toHaveProperty("ipc");
    expect(typeof spawnCalls[0]?.options["ipc"]).toBe("function");

    await manager.stop();
  });

  it("should send an immediate heartbeat on start", async () => {
    const manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: "/tmp/dist",
      sharedImagesDir: "/tmp/images",
      productionPort: 8080,
    });

    await manager.start();

    // Should have sent at least one heartbeat immediately
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);
    expect(sentMessages[0]).toEqual({ type: "heartbeat" });

    await manager.stop();
  });

  it("should stop heartbeat on stop", async () => {
    const manager = new ServerManager({
      logger: createSilentLogger("test"),
      productionDistDir: "/tmp/dist",
      sharedImagesDir: "/tmp/images",
      productionPort: 8080,
    });

    await manager.start();
    const countAfterStart = sentMessages.length;

    await manager.stop();

    // Wait a bit to ensure no more heartbeats are sent
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sentMessages.length).toBe(countAfterStart);
  });
});
