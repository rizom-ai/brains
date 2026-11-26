/**
 * Run a brain's homeserver locally, the way a deploy runs it beside the
 * brain: Tuwunel in Docker, configured by the same renderer, its data under
 * MATRIX_DATA_DIR (default ./matrix-data). Reads the MATRIX_* values the
 * brain reads. Stops with the process.
 * Usage: bun plugins/matrix-server/scripts/local-homeserver.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runProcess } from "@brains/utils/run-process";
import { z } from "@brains/utils/zod";
import { renderHomeserverConfig } from "../src/homeserver-config";

/** The Tuwunel release a deploy runs; bump both together. */
const TUWUNEL_IMAGE = "ghcr.io/matrix-construct/tuwunel:v2.0.0";

const env = z
  .object({
    MATRIX_SERVER_NAME: z.string().min(1),
    MATRIX_PUBLIC_URL: z.url(),
    MATRIX_HOMESERVER_URL: z.url(),
    MATRIX_REGISTRATION_TOKEN: z.string().min(16),
    MATRIX_OIDC_CLIENT_SECRET: z.string().min(32),
    MATRIX_DATA_DIR: z.string().default("matrix-data"),
  })
  .parse(process.env);

const dataDir = resolve(env.MATRIX_DATA_DIR);
mkdirSync(dataDir, { recursive: true });
const port = Number(new URL(env.MATRIX_HOMESERVER_URL).port || "8008");
writeFileSync(
  resolve(dataDir, "tuwunel.toml"),
  renderHomeserverConfig({
    serverName: env.MATRIX_SERVER_NAME,
    publicBaseUrl: env.MATRIX_PUBLIC_URL,
    registrationToken: env.MATRIX_REGISTRATION_TOKEN,
    oidcClientSecret: env.MATRIX_OIDC_CLIENT_SECRET,
    databasePath: "/data/db",
    backupPath: "/data/backup",
    port,
  }),
);

const docker = Bun.spawn(
  [
    "docker",
    "run",
    "--rm",
    "--name",
    `brain-matrix-${port}`,
    // The brain on the host is the homeserver's identity provider.
    "--network",
    "host",
    "-v",
    `${dataDir}:/data`,
    "-e",
    "TUWUNEL_CONFIG=/data/tuwunel.toml",
    TUWUNEL_IMAGE,
  ],
  { stdout: "inherit", stderr: "inherit" },
);
const stop = (): void => {
  void runProcess(["docker", "stop", `brain-matrix-${port}`]);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.exit(await docker.exited);
