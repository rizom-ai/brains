import type { CommandResult } from "./command-result";
import {
  spawnBunRunner,
  type SpawnBunRunnerDependencies,
} from "./spawn-bun-runner";

export type BrainChildRole = "web" | "worker";

export interface ProcessSupervisorDependencies extends SpawnBunRunnerDependencies {
  argv?: readonly string[];
  entrypointPath?: string;
}

export function parseBrainChildRole(
  argv: readonly string[],
): BrainChildRole | undefined {
  const childArg = argv.find((arg) => arg.startsWith("--child="));
  if (!childArg) return undefined;

  const role = childArg.slice("--child=".length);
  if (role === "web" || role === "worker") return role;
  throw new Error(`Invalid internal Brain child role "${role}"`);
}

/** S1 supervisor: keep the parent runtime-free and own one full web child. */
export function superviseWebChild(
  cwd: string,
  entrypointPath: string,
  dependencies: SpawnBunRunnerDependencies = {},
): Promise<CommandResult> {
  return spawnBunRunner({
    cwd,
    args: [entrypointPath, "start", "--child=web"],
    failureMessage: (code) => `Brain web child exited with code ${code}`,
    ...dependencies,
  });
}
