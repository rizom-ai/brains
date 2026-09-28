import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GIT_BROKER_CHECKOUT_ENV,
  GIT_BROKER_SOCKET_ENV,
} from "@brains/directory-sync";
import {
  withGitBrokerSidecar,
  type GitBrokerSidecarDependencies,
} from "../src/lib/git-broker-sidecar";

let scratch: string | undefined;

const GIT_CONFIGURED = {
  brain: "brain",
  plugins: {
    "directory-sync": {
      git: { repo: "rizom-ai/content", branch: "main" },
    },
  },
};

interface SidecarChild extends EventEmitter {
  pid: number;
  exitCode: number | null;
  killed: boolean;
  kill: ReturnType<typeof mock>;
}

function sidecarHarness(
  closeOnSignal = true,
  groupSurvivesLeader = false,
): {
  children: SidecarChild[];
  spawnImpl: ReturnType<typeof mock>;
  processImpl: EventEmitter & {
    env: NodeJS.ProcessEnv;
    kill: ReturnType<typeof mock>;
  };
} {
  const children: SidecarChild[] = [];
  const spawnImpl = mock(() => {
    const child = Object.assign(new EventEmitter(), {
      pid: 4_201,
      exitCode: null,
      killed: false,
      kill: mock((_signal?: number | NodeJS.Signals) => {
        if (closeOnSignal) {
          queueMicrotask(() => child.emit("close", 0, "SIGTERM"));
        }
        return true;
      }),
    });
    children.push(child);
    return child;
  });
  let groupAlive = groupSurvivesLeader;
  const processImpl = Object.assign(new EventEmitter(), {
    env: {},
    kill: mock((_pid: number, signal?: NodeJS.Signals | 0) => {
      if (signal === "SIGKILL" && groupAlive) {
        groupAlive = false;
        return true;
      }
      if (signal === 0 && groupAlive) return true;
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    }),
  });
  return { children, spawnImpl, processImpl };
}

function dependencies(
  harness: ReturnType<typeof sidecarHarness>,
): GitBrokerSidecarDependencies {
  return {
    spawnImpl: harness.spawnImpl,
    processImpl: harness.processImpl,
    entrypointPath: "/dist/brain.js",
    startupTimeoutMs: 1_000,
    shutdownGraceMs: 1_000,
  };
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("a git-configured brain outside the supervisor", () => {
  it("releases the shutdown deadline after the broker has retired", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-deadline-"));
    const fixture = join(scratch, "probe.ts");
    const moduleUrl = new URL(
      "../src/lib/git-broker-sidecar.ts",
      import.meta.url,
    );
    await writeFile(
      fixture,
      `import { EventEmitter } from "node:events";
       import { withGitBrokerSidecar } from ${JSON.stringify(moduleUrl.href)};
       const child = Object.assign(new EventEmitter(), {
         pid: 4201,
         kill: () => {
           queueMicrotask(() => child.emit("close", 0, null));
           return true;
         },
       });
       const processImpl = Object.assign(new EventEmitter(), {
         env: {},
         kill: () => { throw Object.assign(new Error("gone"), { code: "ESRCH" }); },
       });
       const pending = withGitBrokerSidecar(
         ${JSON.stringify(scratch)},
         ${JSON.stringify(GIT_CONFIGURED)},
         async () => "booted",
         {
           spawnImpl: () => child,
           processImpl,
           entrypointPath: "/dist/brain.js",
           shutdownGraceMs: 2000,
         },
       );
       child.emit("message", { type: "broker-ready" });
       await pending;
       console.log("broker-retired");`,
    );
    const child = Bun.spawn([process.execPath, fixture], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const diagnostics = new Response(child.stderr).text();
    try {
      const reader = child.stdout.getReader();
      const first = await reader.read();
      reader.releaseLock();
      expect(new TextDecoder().decode(first.value).trim()).toBe(
        "broker-retired",
      );
      const retiredAt = performance.now();
      expect(await child.exited).toBe(0);
      expect(await diagnostics).toBe("");
      expect(performance.now() - retiredAt).toBeLessThan(1000);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await child.exited;
      await diagnostics;
    }
  });

  it("hands the owner and its absolute checkout to the app role", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-"));
    const harness = sidecarHarness();
    const seen: Array<{
      socket: string | undefined;
      checkout: string | undefined;
    }> = [];

    const pending = withGitBrokerSidecar(
      scratch,
      GIT_CONFIGURED,
      () => {
        seen.push({
          socket: harness.processImpl.env[GIT_BROKER_SOCKET_ENV],
          checkout: harness.processImpl.env[GIT_BROKER_CHECKOUT_ENV],
        });
        return Promise.resolve("booted");
      },
      dependencies(harness),
    );
    const child = harness.children[0];
    if (!child) throw new Error("Expected broker child");

    expect(harness.spawnImpl).toHaveBeenCalledWith(
      "bun",
      ["/dist/brain.js", "start", "--child=git-broker"],
      expect.objectContaining({ detached: true, cwd: scratch }),
    );
    child.emit("message", { type: "broker-ready" });

    expect(await pending).toBe("booted");
    expect(seen[0]?.socket).toContain("git-broker.sock");
    expect(seen[0]?.checkout).toBe(join(scratch, "brain-data"));
    expect(harness.processImpl.env[GIT_BROKER_SOCKET_ENV]).toBeUndefined();
    expect(harness.processImpl.env[GIT_BROKER_CHECKOUT_ENV]).toBeUndefined();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("kills descendants left after the owner exits gracefully", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-descendant-"));
    const harness = sidecarHarness(true, true);

    const pending = withGitBrokerSidecar(
      scratch,
      GIT_CONFIGURED,
      () => Promise.resolve("booted"),
      {
        ...dependencies(harness),
        groupProbeAttempts: 1,
      },
    );
    const child = harness.children[0];
    if (!child) throw new Error("Expected broker child");
    child.emit("message", { type: "broker-ready" });

    expect(await pending).toBe("booted");
    expect(harness.processImpl.kill).toHaveBeenCalledWith(
      -child.pid,
      "SIGKILL",
    );
  });

  it("accepts ESRCH when the group exits during SIGKILL escalation", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-kill-race-"));
    const harness = sidecarHarness(false);

    const pending = withGitBrokerSidecar(
      scratch,
      GIT_CONFIGURED,
      () => Promise.resolve("booted"),
      {
        ...dependencies(harness),
        shutdownGraceMs: 0,
        groupProbeAttempts: 1,
      },
    );
    const child = harness.children[0];
    if (!child) throw new Error("Expected broker child");
    child.emit("message", { type: "broker-ready" });

    expect(await pending).toBe("booted");
    expect(harness.processImpl.kill).toHaveBeenCalledWith(
      -child.pid,
      "SIGKILL",
    );
  });

  it("starts nothing for a brain without git", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-none-"));
    const harness = sidecarHarness();
    const seen: Array<string | undefined> = [];

    await withGitBrokerSidecar(
      scratch,
      { brain: "brain" },
      () => {
        seen.push(harness.processImpl.env[GIT_BROKER_SOCKET_ENV]);
        return Promise.resolve(undefined);
      },
      dependencies(harness),
    );

    expect(seen).toEqual([undefined]);
    expect(harness.spawnImpl).not.toHaveBeenCalled();
  });

  it("stops the owner child even when the boot fails", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-fail-"));
    const harness = sidecarHarness();

    const pending = withGitBrokerSidecar(
      scratch,
      GIT_CONFIGURED,
      () => Promise.reject(new Error("boot failed")),
      dependencies(harness),
    );
    const child = harness.children[0];
    if (!child) throw new Error("Expected broker child");
    child.emit("message", { type: "broker-ready" });

    const outcome = await pending.then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toContain("boot failed");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(harness.processImpl.env[GIT_BROKER_SOCKET_ENV]).toBeUndefined();
  });

  it("does not run the Brain when the owner exits before ready", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-start-fail-"));
    const harness = sidecarHarness();
    const run = mock(async () => "must not run");

    const pending = withGitBrokerSidecar(
      scratch,
      GIT_CONFIGURED,
      run,
      dependencies(harness),
    );
    const child = harness.children[0];
    if (!child) throw new Error("Expected broker child");
    child.emit("close", 1, null);

    const outcome = await pending.then(
      () => undefined,
      (error: unknown) => String(error),
    );
    expect(outcome).toContain("before ready");
    expect(run).not.toHaveBeenCalled();
  });
});
