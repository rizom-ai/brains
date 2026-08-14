import { DEFAULT_GIT_TIMEOUT_MS } from "./git-options";
import { defaultGitRunnerFactory } from "./git-runner-factory";
import type { GitRunnerFactory } from "./git-runner-factory";
import { join } from "path";
import { pathExists } from "./fs-utils";

export async function hasGitHead(
  dir: string,
  runnerFactory: GitRunnerFactory = defaultGitRunnerFactory,
): Promise<boolean> {
  if (!(await pathExists(join(dir, ".git")))) {
    return false;
  }
  try {
    await runnerFactory({
      baseDir: dir,
      timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
    }).run(["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}
