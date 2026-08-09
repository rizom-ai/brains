import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "@brains/utils/zod";

export type UpgradeExec = (command: string[], cwd: string) => Promise<void>;

export interface UpgradeOptions {
  exec?: UpgradeExec | undefined;
  version?: string | undefined;
}

export interface UpgradeResult {
  from: string;
  to: string;
}

const packageJsonPinSchema = z.object({
  devDependencies: z.record(z.string(), z.string()).optional(),
});

async function readOpsPin(rootDir: string): Promise<string> {
  const packageJsonPath = join(rootDir, "package.json");
  const parsed = packageJsonPinSchema.parse(
    JSON.parse(await readFile(packageJsonPath, "utf8")),
  );
  const pin = parsed.devDependencies?.["@rizom/ops"];
  if (!pin) {
    throw new Error(
      `${packageJsonPath} does not pin @rizom/ops as a devDependency`,
    );
  }
  return pin;
}

async function defaultExec(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit ${exitCode}`);
  }
}

export async function upgradePilotRepo(
  rootDir: string,
  options: UpgradeOptions = {},
): Promise<UpgradeResult> {
  const exec = options.exec ?? defaultExec;
  const from = await readOpsPin(rootDir);
  const target = options.version ?? "latest";

  await exec(
    ["bun", "add", "--dev", "--exact", `@rizom/ops@${target}`],
    rootDir,
  );
  const to = await readOpsPin(rootDir);

  // Rerun init through bun x so the scaffold refresh comes from the freshly
  // installed target version, not the version running this command.
  await exec(["bun", "x", "brains-ops", "init", "."], rootDir);

  return { from, to };
}
