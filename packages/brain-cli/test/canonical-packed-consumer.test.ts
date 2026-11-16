import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  openOfflineEntityDatabase,
  readDatabaseLeases,
} from "@brains/entity-service";
import {
  combinedOutput,
  installPackedConsumer,
  packPackages,
  runCommand,
  startCommand,
  stopProcess,
} from "./helpers/packed-consumer";

const packageDirectory = join(import.meta.dir, "..");
const fixtureDirectory = join(
  import.meta.dir,
  "fixtures",
  "canonical-packed-consumer",
);

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

async function leaseCount(databasePath: string): Promise<number> {
  const { client } = openOfflineEntityDatabase(databasePath);
  try {
    return (await readDatabaseLeases(client)).length;
  } finally {
    client.close();
  }
}

describe("canonical packed consumer", () => {
  let temporaryDirectory: string;
  let consumerDirectory: string;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "canonical-brain-pack-"));
    const tarballs = await packPackages(
      [packageDirectory],
      join(temporaryDirectory, "tarballs"),
    );
    consumerDirectory = join(temporaryDirectory, "consumer");
    await installPackedConsumer(fixtureDirectory, consumerDirectory, tarballs);
    await mkdir(join(consumerDirectory, "seed-content"));
    await writeFile(
      join(consumerDirectory, "seed-content", "README.md"),
      "# Packed consumer\n",
    );
  }, 180_000);

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test("installs, imports, and completes a startup check outside the monorepo", async () => {
    await runCommand(["bun", "run", "import-smoke.ts"], consumerDirectory);
    const startup = await runCommand(
      ["bun", "run", "brain", "start", "--startup-check"],
      consumerDirectory,
      {
        env: {
          ...process.env,
          OPENAI_API_KEY: "packed-startup-check",
          GIT_SYNC_TOKEN: "packed-startup-check",
        },
        timeoutMs: 90_000,
      },
    );

    expect(combinedOutput(startup)).toContain("Dashboard plugin registered");
  }, 120_000);

  // The deployed image's command, with nothing opting out of the local
  // install hand-off: SIGTERM, as `docker stop` sends it, has to reach the
  // brain and run its whole shutdown, which releases the database lease.
  test("stops gracefully on SIGTERM when started the way the image starts it", async () => {
    const port = freePort();
    const databasePath = join(consumerDirectory, "stop-data", "brain.db");
    await mkdir(join(consumerDirectory, "stop-data"));
    await writeFile(
      join(consumerDirectory, "brain.yaml"),
      [
        "brain: brain",
        "bundleContract: capability-bundles-v1",
        "anchor: person",
        "kind: professional",
        "bundles:",
        "  - core",
        "  - web",
        "  - chat",
        `port: ${port}`,
        `database: "file:${databasePath}"`,
        "embedding:",
        "  enabled: false",
        "plugins:",
        "  onboarding:",
        "    enabled: false",
        "  directory-sync:",
        "    seedContentPath: ./seed-content",
        "",
      ].join("\n"),
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...refusedNetwork,
      NODE_ENV: "production",
      OPENAI_API_KEY: "packed-graceful-stop",
      XDG_DATA_HOME: join(temporaryDirectory, "xdg-data"),
    };
    delete env["BRAIN_SKIP_LOCAL_REEXEC"];

    const runtime = startCommand(
      [
        "bun",
        "--no-orphans",
        "./node_modules/@rizom/brain/dist/brain.js",
        "start",
      ],
      consumerDirectory,
      { env },
    );
    try {
      // Both roles, not only the web: a SIGTERM while the worker is still
      // booting is a different window from the one this proves.
      await runtime.waitForOutput("Brain web runtime ready", 120_000);
      await runtime.waitForOutput("Brain worker runtime ready", 120_000);
      expect(await leaseCount(databasePath)).toBeGreaterThan(0);

      await stopProcess(runtime.process, 30_000);
      const result = await runtime.completed;

      expect(result.exitCode, combinedOutput(result)).toBe(0);
      expect(await leaseCount(databasePath)).toBe(0);
    } finally {
      await stopProcess(runtime.process, 1_000);
    }
  }, 240_000);
});
