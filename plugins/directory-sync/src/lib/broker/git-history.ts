import type { SimpleGit } from "simple-git";
import type { GitLogEntry } from "../../types/results";

/** The one git capability reading history needs. */
export interface GitRawRunner {
  raw(args: string[]): Promise<string>;
}

/**
 * Get commit history for a specific file.
 * Returns commits in reverse chronological order (newest first).
 */
export async function getFileHistory(
  git: GitRawRunner,
  filePath: string,
  limit?: number,
): Promise<GitLogEntry[]> {
  const args = ["log", "--format=%H%n%aI%n%s"];
  if (limit) {
    args.push(`-${limit}`);
  }
  args.push("--", filePath);

  // git log exits cleanly with no output for a file that has no commits or
  // never existed, so that case is the empty result below. Anything that makes
  // git itself fail is a real fault and belongs to the caller, not another
  // empty history.
  const result = await git.raw(args);
  if (!result.trim()) return [];

  const lines = result.trim().split("\n");
  const entries: GitLogEntry[] = [];

  // Every 3 lines is one commit: sha, date, message
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const sha = lines[i];
    const date = lines[i + 1];
    const message = lines[i + 2];
    if (sha && date && message !== undefined) {
      entries.push({ sha, date, message });
    }
  }

  return entries;
}

/**
 * Get file content at a specific commit.
 * Throws if the sha or file path is invalid.
 */
export function showFileAtCommit(
  git: SimpleGit,
  sha: string,
  filePath: string,
): Promise<string> {
  return git.show([`${sha}:${filePath}`]);
}
