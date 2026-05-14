import simpleGit from "simple-git";
import { join } from "path";
import { pathExists } from "./fs-utils";

export async function hasGitHead(dir: string): Promise<boolean> {
  if (!(await pathExists(join(dir, ".git")))) {
    return false;
  }
  try {
    await simpleGit(dir).revparse(["--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}
