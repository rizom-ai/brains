import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openOfflineEntityDatabase,
  readDatabaseLeases,
} from "@brains/entity-service";

/**
 * A stop that arrives while an app role is still booting, as `docker stop`
 * does during a deploy or a crash loop. The role has already taken its
 * database lease, so the stop has to run its shutdown, not end the process.
 */

const brainJs = join(import.meta.dir, "..", "dist", "brain.js");
const linuxIt = process.platform === "linux" ? it : it.skip;
const instanceDirs: string[] = [];

/** No outbound request leaves the brain: every proxied fetch is refused. */
const refusedNetwork = {
  HTTP_PROXY: "http://127.0.0.1:9",
  HTTPS_PROXY: "http://127.0.0.1:9",
  http_proxy: "http://127.0.0.1:9",
  https_proxy: "http://127.0.0.1:9",
  NO_PROXY: "localhost,127.0.0.1",
  no_proxy: "localhost,127.0.0.1",
};

function freePort(): number {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
}

afterEach(() => {
  for (const dir of instanceDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Stopped {
  exitCode: number;
  leases: number;
  output: string;
}

/**
 * Boot a brain and send SIGTERM to the supervisor when the role logs a line
 * containing `trigger`, which is a point inside that role's initialize.
 */
async function stopDuringBoot(
  role: "web" | "worker",
  trigger: string,
): Promise<Stopped> {
  const instanceDir = mkdtempSync(join(tmpdir(), "brain-boot-window-"));
  instanceDirs.push(instanceDir);
  const databasePath = join(instanceDir, "data", "brain.db");
  mkdirSync(join(instanceDir, "data"));
  writeFileSync(
    join(instanceDir, "brain.yaml"),
    [
      "brain: brain",
      "bundleContract: capability-bundles-v1",
      "anchor: person",
      "kind: professional",
      "bundles:",
      "  - core",
      "  - web",
      "  - chat",
      `port: ${freePort()}`,
      "logLevel: debug",
      `database: "file:${databasePath}"`,
      "embedding:",
      "  enabled: false",
      "plugins:",
      "  onboarding:",
      "    enabled: false",
      "",
    ].join("\n"),
  );

  const proc = Bun.spawn(["bun", "--no-orphans", brainJs, "start"], {
    cwd: instanceDir,
    env: {
      ...process.env,
      ...refusedNetwork,
      NODE_ENV: "production",
      OPENAI_API_KEY: "placeholder-boot-window",
      XDG_DATA_HOME: join(instanceDir, "xdg-data"),
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  let output = "";
  const sent = { sigterm: false };
  const prefix = `[${role}]`;
  const decoder = new TextDecoder();
  const capture = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    for await (const chunk of stream) {
      output += decoder.decode(chunk, { stream: true });
      if (
        !sent.sigterm &&
        output
          .split("\n")
          .some((line) => line.startsWith(prefix) && line.includes(trigger))
      ) {
        sent.sigterm = true;
        proc.kill("SIGTERM");
      }
    }
  };
  const captured = Promise.all([capture(proc.stdout), capture(proc.stderr)]);
  const exited = await Promise.race([
    proc.exited,
    Bun.sleep(90_000).then(() => undefined),
  ]);
  if (exited === undefined) proc.kill("SIGKILL");
  const exitCode = await proc.exited;
  await captured;
  if (!sent.sigterm) {
    throw new Error(`${prefix} never logged "${trigger}"\n${output}`);
  }

  const { client } = openOfflineEntityDatabase(databasePath);
  try {
    const table = await client.execute(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'database_leases'",
    );
    if (table.rows.length === 0) {
      throw new Error(`No database_leases table\n${output}`);
    }
    return {
      exitCode,
      leases: (await readDatabaseLeases(client)).length,
      output,
    };
  } finally {
    client.close();
  }
}

const bootPoints: ReadonlyArray<readonly ["web" | "worker", string]> = [
  ["worker", "Starting Shell boot"],
  ["worker", "Initializing plugins..."],
  ["worker", "Projection runtime activated"],
  ["worker", "Starting JobQueueWorker"],
  ["web", "Starting Shell boot"],
  ["web", "Initializing plugins..."],
  ["web", "Production server listening"],
  ["web", "Starting plugin daemons..."],
];

describe("stop during boot", () => {
  for (const [role, trigger] of bootPoints) {
    linuxIt(
      `releases every lease when SIGTERM arrives at ${role} "${trigger}"`,
      async () => {
        const stopped = await stopDuringBoot(role, trigger);

        expect(stopped.exitCode, stopped.output).toBe(0);
        expect(stopped.leases, stopped.output).toBe(0);
      },
      120_000,
    );
  }
});
