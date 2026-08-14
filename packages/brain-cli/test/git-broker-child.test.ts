import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GIT_BROKER_RUNTIME_DIR_ENV,
  resolveGitBrokerRuntimeDir,
  runGitBrokerChild,
} from "../src/lib/git-broker-child";

const LINUX = process.platform === "linux";

let scratch: string | undefined;

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("git broker child role", () => {
  it("prefers an explicit runtime directory", () => {
    expect(
      resolveGitBrokerRuntimeDir("/brain", {
        [GIT_BROKER_RUNTIME_DIR_ENV]: "/run/brain/broker",
        XDG_DATA_HOME: "/data",
      }),
    ).toBe("/run/brain/broker");
  });

  it("falls back to the data home, then to the working directory", () => {
    expect(
      resolveGitBrokerRuntimeDir("/brain", { XDG_DATA_HOME: "/data" }),
    ).toBe("/data/brain/git-broker");
    // Never inside the checkout: the socket and journal must survive a
    // checkout being replaced, and must never be committed.
    expect(resolveGitBrokerRuntimeDir("/brain", {})).toBe(
      "/brain/.brain-runtime/git-broker",
    );
  });

  it("reports a failed start rather than announcing readiness", async () => {
    const announced: Array<{ type: string }> = [];

    const result = await runGitBrokerChild("/brain", {
      env: {},
      notifyReady: (message) => announced.push(message),
      startBroker: () => Promise.reject(new Error("socket already owned")),
      untilShutdown: () => Promise.resolve(),
    });

    expect(announced).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.message).toContain("socket already owned");
  });

  it.skipIf(!LINUX)(
    "starts a real broker, announces readiness, and stops on shutdown",
    async () => {
      scratch = await mkdtemp(join(tmpdir(), "broker-child-"));
      const runtimeDir = join(scratch, "runtime");
      const announced: Array<{ type: string }> = [];
      const shutdown = Promise.withResolvers<void>();

      const running = runGitBrokerChild(scratch, {
        env: { [GIT_BROKER_RUNTIME_DIR_ENV]: runtimeDir },
        notifyReady: (message) => {
          announced.push(message);
          // Only shut down once the supervisor would have seen readiness.
          shutdown.resolve();
        },
        untilShutdown: () => shutdown.promise,
      });

      const result = await running;
      const socketGone = await stat(join(runtimeDir, "git-broker.sock")).then(
        () => false,
        () => true,
      );

      expect(announced).toEqual([{ type: "broker-ready" }]);
      expect(result).toEqual({ success: true });
      expect(socketGone).toBe(true);
    },
    30_000,
  );
});
