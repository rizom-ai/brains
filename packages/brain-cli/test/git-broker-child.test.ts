import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { runGitBrokerChild } from "../src/lib/git-broker-child";
import { GIT_BROKER_SOCKET_ENV } from "../src/lib/process-supervisor";

/**
 * Phase 3 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * The broker child's contract with its supervisor: it is told where to listen,
 * it reports ready once it is, and it stops only when asked.
 */

const CONFIG = {
  brain: "brain",
  plugins: { "directory-sync": { git: { repo: "rizom-ai/content" } } },
};

function createProcess(env: NodeJS.ProcessEnv): EventEmitter & {
  env: NodeJS.ProcessEnv;
  send: ReturnType<typeof mock>;
} {
  return Object.assign(new EventEmitter(), {
    env,
    send: mock((_message: unknown) => {}),
  });
}

describe("git broker child", () => {
  it("refuses to run without a supervisor-assigned socket", async () => {
    const startHost = mock(async () => ({
      stop: async (): Promise<void> => {},
      activity: { activeRequestIds: [], oldestActiveProgressAt: null },
    }));

    const result = await runGitBrokerChild("/brain", CONFIG, {
      processImpl: createProcess({}),
      startHost,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain(GIT_BROKER_SOCKET_ENV);
    // Guessing a socket path would be guessing at ownership.
    expect(startHost).not.toHaveBeenCalled();
  });

  it("never reports ready when it cannot own the checkout", async () => {
    const processImpl = createProcess({
      [GIT_BROKER_SOCKET_ENV]: "/run/brain/git-broker.sock",
    });

    const result = await runGitBrokerChild("/brain", CONFIG, {
      processImpl,
      startHost: async () => {
        throw new Error("A live Git broker already owns that socket");
      },
    });

    expect(result).toEqual({
      success: false,
      message:
        "Git broker failed to start: A live Git broker already owns that socket",
      exitCode: 1,
    });
    expect(processImpl.send).not.toHaveBeenCalled();
  });

  it("beats with the activity its supervisor watches", async () => {
    const activity = {
      activeRequestIds: ["req_running001"],
      oldestActiveProgressAt: 1_234,
    };
    let beat = (): void => {
      throw new Error("Heartbeat interval was not registered");
    };
    const processImpl = createProcess({
      [GIT_BROKER_SOCKET_ENV]: "/run/brain/git-broker.sock",
    });

    const running = runGitBrokerChild("/brain", CONFIG, {
      processImpl,
      startHost: async () => ({
        stop: async (): Promise<void> => {},
        activity,
      }),
      heartbeatClock: {
        setInterval: (callback: () => void, intervalMs: number): number => {
          beat = callback;
          expect(intervalMs).toBe(5_000);
          return 1;
        },
        clearInterval: () => {},
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A wedged owner does not exit, so the supervisor needs facts, not a
    // liveness ping: what is active, and when it last moved.
    beat();
    expect(processImpl.send).toHaveBeenLastCalledWith({
      type: "broker-heartbeat",
      activeRequestIds: ["req_running001"],
      oldestActiveProgressAt: 1_234,
    });

    processImpl.emit("SIGTERM");
    expect(await running).toEqual({ success: true });
  });

  it("reports ready to its supervisor and stops only on request", async () => {
    const stop = mock(async () => {});
    const startHost = mock(async () => ({
      stop,
      activity: { activeRequestIds: [], oldestActiveProgressAt: null },
    }));
    const processImpl = createProcess({
      [GIT_BROKER_SOCKET_ENV]: "/run/brain/git-broker.sock",
    });

    const running = runGitBrokerChild("/brain", CONFIG, {
      processImpl,
      startHost,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startHost).toHaveBeenCalledWith(
      expect.objectContaining({
        socketPath: "/run/brain/git-broker.sock",
        cwd: "/brain",
        pluginConfig: { git: { repo: "rizom-ai/content" } },
      }),
    );
    expect(processImpl.send).toHaveBeenCalledWith({ type: "broker-ready" });
    expect(stop).not.toHaveBeenCalled();

    processImpl.emit("SIGTERM");
    expect(await running).toEqual({ success: true });
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
