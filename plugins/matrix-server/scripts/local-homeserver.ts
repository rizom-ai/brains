/**
 * Run a brain's homeserver locally, the way a deploy runs it beside the
 * brain: Tuwunel in Docker on the directory the brain shares with it
 * (MATRIX_DATA_DIR). The brain writes the homeserver's configuration there
 * when it starts; until then Docker's restart policy keeps retrying, as
 * Kamal's does. Stops the container with the process.
 * Usage: bun plugins/matrix-server/scripts/local-homeserver.ts
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runProcess } from "@brains/utils/run-process";
import { z } from "@brains/utils/zod";
import { HOMESERVER_PORT } from "../src/homeserver-secrets";

/** The Tuwunel release a deploy runs; bump both together. */
const TUWUNEL_IMAGE = "ghcr.io/matrix-construct/tuwunel:v2.0.0";

const env = z
  .object({
    MATRIX_DATA_DIR: z.string().min(1),
  })
  .parse(process.env);

const dataDir = resolve(env.MATRIX_DATA_DIR);
mkdirSync(dataDir, { recursive: true });
const name = `brain-matrix-${HOMESERVER_PORT}`;

await runProcess(["docker", "rm", "-f", name]);
const started = await runProcess([
  "docker",
  "run",
  "--detach",
  "--name",
  name,
  "--restart",
  "unless-stopped",
  // On the host's network, at 127.0.0.1:8008, so it reaches the brain on
  // the host, which is its identity provider.
  "--network",
  "host",
  "--volume",
  `${dataDir}:/data`,
  "--env",
  "TUWUNEL_CONFIG=/data/tuwunel.toml",
  TUWUNEL_IMAGE,
]);
if (started.exitCode !== 0) {
  console.error(started.stderr);
  process.exit(started.exitCode);
}
console.log(
  `${name} is waiting for the brain to write ${dataDir}/tuwunel.toml`,
);

const stop = async (): Promise<void> => {
  await runProcess(["docker", "rm", "-f", name]);
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
await runProcess(["docker", "logs", "--follow", name], {});
