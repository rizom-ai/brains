import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runGitBrokerChild } from "../../src/lib/git-broker-child";
import type { BrainYamlConfig } from "../../src/lib/brain-yaml";
import type { CommandResult } from "../../src/lib/command-result";

/**
 * The child side of the Phase 6 harness.
 *
 * Stands in for the packaged Brain's entrypoint so the supervisor spawns real
 * processes: a real broker owning a real checkout, and app roles that stay up.
 *
 * Configuration is read from the working directory, the way the real child
 * reads `brain.yaml`, rather than from variables invented for the harness.
 * Only the socket comes from the environment, because that is the supervisor
 * handing a runtime endpoint to a process it just spawned.
 *
 * The roles record their identity on disk, because the proof is about which
 * processes survived a broker replacement and which did not.
 */

const role = process.argv.find((arg) => arg.startsWith("--child="))?.slice(8);
const root = process.cwd();

async function announce(name: string): Promise<void> {
  await writeFile(join(root, `${name}.pid`), String(process.pid));
  await appendFile(join(root, `${name}.starts`), `${process.pid}\n`);
}

async function readConfig(): Promise<BrainYamlConfig> {
  const raw = await readFile(join(root, "brain-config.json"), "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("The harness config is not an object");
  }
  return { brain: "brain", ...parsed };
}

if (role === "git-broker") {
  await announce("broker");
  const result = await runGitBrokerChild(root, await readConfig()).catch(
    async (error: unknown): Promise<CommandResult> => {
      await writeFile(join(root, "broker.error"), String(error));
      return { success: false };
    },
  );
  if (!result.success) {
    await appendFile(join(root, "broker.error"), "\nbroker child failed\n");
  }
  process.exit(result.success ? 0 : 1);
}

if (role === "web" || role === "worker") {
  await announce(role);
  process.send?.({ type: role === "web" ? "runtime-ready" : "worker-ready" });
  if (role === "worker") {
    // The worker's own liveness signal, so a role that quietly wedged is not
    // mistaken for one that stayed healthy.
    setInterval(() => {
      process.send?.({ type: "worker-heartbeat" });
    }, 200);
  }
  // Stay up until signalled. Surviving a broker replacement is the point.
  setInterval(() => {}, 1_000);
} else if (role !== "git-broker") {
  process.exit(2);
}
