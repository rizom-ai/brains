import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrokerConnection,
  GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV,
  getGitRemoteFingerprint,
  gitBrokerSocketPath,
  probeBrokerActivity,
} from "@brains/directory-sync";
import { GIT_BROKER_TEST_WITHHOLD_COMPLETION_ENV } from "../src/lib/git-broker-child";
import { superviseRuntimeChildren } from "../src/lib/process-supervisor";
import type { SupervisedChildRole } from "../src/lib/process-supervisor";
import type { SignalProcess, SpawnImpl } from "../src/lib/spawn-bun-runner";
import type { CommandResult } from "../src/lib/command-result";

const LINUX = process.platform === "linux";
const RUN_PACKAGED = process.env["RUN_GIT_BROKER_PACKAGED_RECOVERY"] === "1";
const ENTRY = join(import.meta.dir, "..", "dist", "brain.js");

interface SpawnRecord {
  role: SupervisedChildRole;
  pid: number;
}

interface RuntimeController {
  result: Promise<CommandResult>;
  stop(): void;
  initialReady: Promise<void>;
  replacementReady: Promise<void>;
  starts: SpawnRecord[];
}

let cleanup: (() => Promise<void>) | undefined;

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, AI_API_KEY: "packaged-recovery-test-key" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}${stderr}`;
  if (code !== 0) {
    throw new Error(`${command.join(" ")} failed (${code}): ${output}`);
  }
  return output;
}

function reservePort(): number {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: (): void => {} },
  });
  const port = server.port;
  server.stop(true);
  return port;
}

async function until<T>(
  description: string,
  operation: () => Promise<T | undefined>,
  timeoutMs = 60_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await operation();
    if (value !== undefined) return value;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForRuntimeBarrier(
  controller: RuntimeController,
  barrier: Promise<void>,
  description: string,
): Promise<void> {
  await Promise.race([
    barrier,
    controller.result.then((result) => {
      throw new Error(
        `Runtime stopped before ${description}: ${JSON.stringify(result)}`,
      );
    }),
  ]);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function membersOfGroup(group: number): Promise<number[]> {
  const members: number[] = [];
  for (const entry of await readdir("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = await readFile(`/proc/${entry}/stat`, "utf-8").catch(
      () => undefined,
    );
    if (!stat) continue;
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (fields[0] === "Z") continue;
    if (Number(fields[2]) === group) members.push(Number(entry));
  }
  return members.sort((left, right) => left - right);
}

async function waitForHealthStatus(
  baseUrl: string,
  endpoint: string,
  expected: number,
): Promise<void> {
  await until(`${endpoint}=${expected}`, async () => {
    const status = await fetch(`${baseUrl}${endpoint}`).then(
      (response) => response.status,
      () => undefined,
    );
    return status === expected ? true : undefined;
  });
}

function runtimeProcess(groupAlwaysPresent: boolean): {
  emitter: EventEmitter;
  impl: SignalProcess;
} {
  const emitter = new EventEmitter();
  return {
    emitter,
    impl: {
      env: {
        ...process.env,
        AI_API_KEY: "packaged-recovery-test-key",
        [GIT_BROKER_TEST_WITHHOLD_COMPLETION_ENV]: "commit-and-push",
        [GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV]: "500",
      },
      kill: (pid, signal): boolean => {
        if (groupAlwaysPresent && signal === 0) return true;
        return process.kill(pid, signal);
      },
      on: (event, listener) => emitter.on(event, listener),
      removeListener: (event, listener) =>
        emitter.removeListener(event, listener),
    },
  };
}

function startRuntime(
  appDir: string,
  groupAlwaysPresent: boolean,
): RuntimeController {
  const processSurface = runtimeProcess(groupAlwaysPresent);
  const starts: SpawnRecord[] = [];
  const initialReady = Promise.withResolvers<void>();
  const replacementReady = Promise.withResolvers<void>();
  const ready = new Set<SupervisedChildRole>();
  let brokerReadyCount = 0;

  const spawnImpl: SpawnImpl = (command, args, options) => {
    const child = spawn(command, args, options);
    const roleArg = args.find((arg) => arg.startsWith("--child="));
    const role = roleArg?.slice("--child=".length);
    if (
      child.pid !== undefined &&
      (role === "git-broker" || role === "web" || role === "worker")
    ) {
      starts.push({ role, pid: child.pid });
    }
    return child;
  };

  const result = superviseRuntimeChildren(appDir, ENTRY, {
    spawnImpl,
    processImpl: processSurface.impl,
    gitBroker: {
      socketPath: gitBrokerSocketPath(join(appDir, ".brain-runtime")),
    },
    startupTimeoutMs: 60_000,
    shutdownGraceMs: 2_000,
    brokerProgressTimeoutMs: 1_500,
    brokerGroupProbeIntervalMs: 100,
    brokerGroupProbeAttempts: 40,
    reportIncident: () => {},
    reportReady: (role) => {
      ready.add(role);
      if (role === "git-broker") {
        brokerReadyCount += 1;
        if (brokerReadyCount === 2) replacementReady.resolve();
      }
      if (ready.has("git-broker") && ready.has("web") && ready.has("worker")) {
        initialReady.resolve();
      }
    },
  });

  return {
    result,
    starts,
    initialReady: initialReady.promise,
    replacementReady: replacementReady.promise,
    stop: (): void => void processSurface.emitter.emit("SIGTERM"),
  };
}

async function createApp(): Promise<{
  root: string;
  checkout: string;
  remote: string;
  healthBaseUrl: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "packaged-broker-recovery-"));
  const remote = join(root, "content.git");
  const writer = join(root, "writer");
  await run(["git", "init", "--bare", "--initial-branch=main", remote], root);
  await run(["git", "init", "--initial-branch=main", writer], root);
  await writeFile(
    join(writer, "baseline.md"),
    '---\ntitle: "Packaged Recovery Baseline"\n---\n\nbaseline\n',
  );
  await run(["git", "add", "-A"], writer);
  await run(
    [
      "git",
      "-c",
      "user.name=Recovery Test",
      "-c",
      "user.email=recovery@example.com",
      "commit",
      "-m",
      "seed packaged recovery",
    ],
    writer,
  );
  await run(["git", "remote", "add", "origin", remote], writer);
  await run(["git", "push", "origin", "main"], writer);

  const productionPort = reservePort();
  const apiPort = reservePort();
  const previewPort = reservePort();
  await writeFile(
    join(root, "brain.yaml"),
    `brain: brain
anchor: person
kind: professional
bundles: [core]
embedding:
  enabled: false
remove:
  - a2a
  - chat
  - email
  - mcp
  - onboarding
  - web-chat
plugins:
  topics:
    enableAutoExtraction: false
  directory-sync:
    autoSync: true
    initialSync: true
    seedContent: false
    syncInterval: 1
    commitDebounce: 100
    git:
      gitUrl: file://${remote}
      bootstrapFromSeed: false
  webserver:
    productionPort: ${productionPort}
    apiPort: ${apiPort}
    previewPort: ${previewPort}
`,
  );

  // The ordinary packaged start performs this migration before supervision.
  // Startup-check also proves its standalone broker child can initialize and
  // stop before the recovery supervisor inherits that generation.
  await run(["bun", ENTRY, "start", "--startup-check"], root);

  return {
    root,
    checkout: join(root, "brain-data"),
    remote,
    healthBaseUrl: `http://127.0.0.1:${productionPort}`,
  };
}

async function connect(app: {
  root: string;
  checkout: string;
  remote: string;
}): Promise<BrokerConnection> {
  const connection = await BrokerConnection.connect(
    gitBrokerSocketPath(join(app.root, ".brain-runtime")),
  );
  await connection.registerCheckout({
    checkoutPath: app.checkout,
    branch: "main",
    remoteFingerprint: getGitRemoteFingerprint(`file://${app.remote}`),
  });
  return connection;
}

function pendingJobCount(root: string): number {
  const database = new Database(join(root, "data", "brain-jobs.db"), {
    readonly: true,
  });
  try {
    const row = database
      .query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM job_queue WHERE status IN ('pending', 'processing')",
      )
      .get();
    return row?.count ?? 0;
  } finally {
    database.close();
  }
}

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe.skipIf(!LINUX || !RUN_PACKAGED)(
  "the packaged broker recovery boundary",
  () => {
    it("recovers one lost completion without restarting healthy app roles", async () => {
      const app = await createApp();
      const controller = startRuntime(app.root, false);
      cleanup = async (): Promise<void> => {
        controller.stop();
        await controller.result.catch(() => undefined);
        await rm(app.root, { recursive: true, force: true });
      };
      await waitForRuntimeBarrier(
        controller,
        controller.initialReady,
        "initial readiness",
      );
      await waitForHealthStatus(app.healthBaseUrl, "/health/live", 200);
      await waitForHealthStatus(app.healthBaseUrl, "/health/ready", 200);
      await waitForHealthStatus(app.healthBaseUrl, "/health/operate", 200);

      const firstBroker = controller.starts.find(
        (start) => start.role === "git-broker",
      );
      const web = controller.starts.find((start) => start.role === "web");
      const worker = controller.starts.find((start) => start.role === "worker");
      if (!firstBroker || !web || !worker) {
        throw new Error("Expected packaged broker, web, and worker children");
      }

      const client = await connect(app);
      await writeFile(
        join(app.checkout, "lost-completion.md"),
        '---\ntitle: "Lost Completion"\n---\n\nlanded once\n',
      );
      const lost = client
        .execute(app.checkout, { name: "commit-and-push" })
        .then(
          () => undefined,
          (error: unknown) => String(error),
        );
      await until("the withheld operation", async () => {
        const activity = await probeBrokerActivity(
          gitBrokerSocketPath(join(app.root, ".brain-runtime")),
        )().catch(() => undefined);
        return activity?.activeRequestIds.length ? true : undefined;
      });

      // Request-driven operational health degrades, while routing health and
      // both app roles remain alive.
      await waitForHealthStatus(app.healthBaseUrl, "/health/operate", 503);
      await waitForHealthStatus(app.healthBaseUrl, "/health/live", 200);
      await waitForHealthStatus(app.healthBaseUrl, "/health/ready", 200);
      expect(isAlive(web.pid)).toBe(true);
      expect(isAlive(worker.pid)).toBe(true);

      await waitForRuntimeBarrier(
        controller,
        controller.replacementReady,
        "replacement readiness",
      );
      const replacement = controller.starts.filter(
        (start) => start.role === "git-broker",
      )[1];
      if (!replacement) throw new Error("Expected one replacement broker");
      expect(
        controller.starts.filter((start) => start.role === "git-broker"),
      ).toHaveLength(2);
      expect(await membersOfGroup(firstBroker.pid)).toEqual([]);
      expect(isAlive(web.pid)).toBe(true);
      expect(isAlive(worker.pid)).toBe(true);
      expect(String(await lost)).toContain("unavailable");

      // The web role observes socket loss and reconciles without a later Git
      // trigger. Admission and operational health reopen only after that work.
      await waitForHealthStatus(app.healthBaseUrl, "/health/operate", 200);
      await Bun.sleep(100);
      await waitForHealthStatus(app.healthBaseUrl, "/health/operate", 200);
      const replacementClient = await connect(app);
      const status = await replacementClient.status();
      expect(status.recoveryPending).toBe(false);
      expect(status.admitsMutations).toBe(true);
      replacementClient.close();

      const commits = await run(
        [
          "git",
          "--git-dir",
          app.remote,
          "log",
          "--format=%H",
          "--",
          "lost-completion.md",
        ],
        app.root,
      );
      expect(commits.trim().split("\n").filter(Boolean)).toHaveLength(1);
      await until("the durable queue to drain", async () =>
        pendingJobCount(app.root) === 0 ? true : undefined,
      );

      client.close();
      controller.stop();
      expect(await controller.result).toEqual({ success: true });
      await rm(app.root, { recursive: true, force: true });
      cleanup = undefined;
    }, 300_000);

    it("starts no replacement when absence is unproven, then converges next runtime", async () => {
      const app = await createApp();
      let controller = startRuntime(app.root, true);
      cleanup = async (): Promise<void> => {
        controller.stop();
        await controller.result.catch(() => undefined);
        await rm(app.root, { recursive: true, force: true });
      };
      await waitForRuntimeBarrier(
        controller,
        controller.initialReady,
        "fallback initial readiness",
      );
      const firstBroker = controller.starts.find(
        (start) => start.role === "git-broker",
      );
      if (!firstBroker) throw new Error("Expected packaged broker child");

      const client = await connect(app);
      await writeFile(
        join(app.checkout, "fallback-completion.md"),
        '---\ntitle: "Fallback Completion"\n---\n\nlanded once\n',
      );
      const lost = client
        .execute(app.checkout, { name: "commit-and-push" })
        .then(
          () => undefined,
          (error: unknown) => String(error),
        );
      const failed = await controller.result;
      expect(failed.success).toBe(false);
      expect(failed.message).toContain("could not be proven gone");
      expect(
        controller.starts.filter((start) => start.role === "git-broker"),
      ).toHaveLength(1);
      expect(await membersOfGroup(firstBroker.pid)).toEqual([]);
      expect(String(await lost)).toContain("unavailable");
      client.close();

      // External supervision has removed the first tree. A clean next runtime
      // must reconcile the landed mutation before admitting further writes.
      controller = startRuntime(app.root, false);
      await waitForRuntimeBarrier(
        controller,
        controller.initialReady,
        "next-runtime readiness",
      );
      await waitForHealthStatus(app.healthBaseUrl, "/health/operate", 200);
      const recovered = await connect(app);
      const status = await recovered.status();
      expect(status.recoveryPending).toBe(false);
      expect(status.admitsMutations).toBe(true);
      recovered.close();

      const commits = await run(
        [
          "git",
          "--git-dir",
          app.remote,
          "log",
          "--format=%H",
          "--",
          "fallback-completion.md",
        ],
        app.root,
      );
      expect(commits.trim().split("\n").filter(Boolean)).toHaveLength(1);
      await until("the recovered durable queue to drain", async () =>
        pendingJobCount(app.root) === 0 ? true : undefined,
      );

      controller.stop();
      expect(await controller.result).toEqual({ success: true });
      await rm(app.root, { recursive: true, force: true });
      cleanup = undefined;
    }, 300_000);
  },
);
