import { OwnedGitProcessRunner } from "./git-stall";
import { DEFAULT_GIT_TIMEOUT_MS } from "./git-options";
import { join } from "path";
import { pathExists } from "./fs-utils";

export async function hasGitHead(dir: string): Promise<boolean> {
  if (!(await pathExists(join(dir, ".git")))) {
    return false;
  }
  try {
    await new OwnedGitProcessRunner({
      baseDir: dir,
      timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
    }).run(["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}
