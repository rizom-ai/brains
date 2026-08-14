import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { pathExists } from "./fs-utils";

/**
 * Whether a checkout has any branch history yet.
 *
 * Answered from the filesystem rather than by running Git. This is a boot-time
 * probe used to decide whether seed content is needed, and it runs before any
 * checkout owner exists — spinning up a broker and a wrapper process to learn
 * whether a directory contains a ref would cost far more than reading one.
 *
 * A freshly `init`ed repository has no refs; the first commit creates
 * `refs/heads/<branch>`, and repacking moves it into `packed-refs`.
 */
export async function hasGitHead(dir: string): Promise<boolean> {
  const gitDir = join(dir, ".git");
  if (!(await pathExists(gitDir))) {
    return false;
  }

  const looseHeads = await readdir(join(gitDir, "refs", "heads"), {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  if (looseHeads.some((entry) => entry.isFile())) {
    return true;
  }

  const packed = await readFile(join(gitDir, "packed-refs"), "utf-8").catch(
    () => "",
  );
  return packed
    .split("\n")
    .some((line) => !line.startsWith("#") && line.includes(" refs/heads/"));
}
