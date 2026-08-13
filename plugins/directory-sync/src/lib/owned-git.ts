export interface GitCommandOptions {
  signal?: AbortSignal | undefined;
  onProgress?: (() => void) | undefined;
}

export interface GitCommandRunner {
  run(args: readonly string[], options?: GitCommandOptions): Promise<string>;
}

export interface OwnedGitStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

export interface OwnedGitStatus {
  current: string | null;
  ahead: number;
  behind: number;
  files: OwnedGitStatusFile[];
  modified: string[];
  not_added: string[];
  deleted: string[];
  created: string[];
  conflicted: string[];
  staged: string[];
  isClean(): boolean;
}

export interface OwnedGitLogResult {
  all: Array<{ hash: string }>;
  latest: { hash: string } | null;
}

export interface OwnedGitRemote {
  name: string;
  refs: {
    fetch: string;
    push: string;
  };
}

const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

function combineSignals(
  first?: AbortSignal,
  second?: AbortSignal,
): AbortSignal | undefined {
  if (!first) return second;
  if (!second || first === second) return first;
  return AbortSignal.any([first, second]);
}

function combineProgress(
  first?: () => void,
  second?: () => void,
): (() => void) | undefined {
  if (!first) return second;
  if (!second || first === second) return first;
  return (): void => {
    first();
    second();
  };
}

/**
 * Narrow Git client whose every command goes through one owned process runner.
 * It intentionally implements only the operations used by directory-sync.
 */
export class OwnedGit {
  private readonly runner: GitCommandRunner;

  constructor(runner: GitCommandRunner) {
    this.runner = runner;
  }

  withOptions(options: GitCommandOptions): OwnedGit {
    return new OwnedGit({
      run: (args, commandOptions) =>
        this.runner.run(args, {
          signal: combineSignals(options.signal, commandOptions?.signal),
          onProgress: combineProgress(
            options.onProgress,
            commandOptions?.onProgress,
          ),
        }),
    });
  }

  raw(args: readonly string[], options?: GitCommandOptions): Promise<string> {
    return this.runner.run(args, options);
  }

  async revparse(args: readonly string[]): Promise<string> {
    return (await this.runner.run(["rev-parse", ...args])).trim();
  }

  diff(args: readonly string[]): Promise<string> {
    return this.runner.run(["diff", ...args]);
  }

  async add(args: string | readonly string[]): Promise<string> {
    return this.runner.run([
      "add",
      ...(typeof args === "string" ? [args] : args),
    ]);
  }

  async commit(message: string): Promise<{ commit: string | undefined }> {
    await this.runner.run(["commit", "-m", message]);
    return { commit: await this.revparse(["HEAD"]) };
  }

  show(args: readonly string[]): Promise<string> {
    return this.runner.run(["show", ...args]);
  }

  async checkout(branch: string): Promise<void> {
    await this.runner.run(["checkout", branch]);
  }

  async checkoutLocalBranch(branch: string): Promise<void> {
    await this.runner.run(["checkout", "-b", branch]);
  }

  async addConfig(key: string, value: string): Promise<void> {
    await this.runner.run(["config", key, value]);
  }

  async remote(args: readonly string[]): Promise<void> {
    await this.runner.run(["remote", ...args]);
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.runner.run(["remote", "add", name, url]);
  }

  async getRemotes(verbose = false): Promise<OwnedGitRemote[]> {
    const output = await this.runner.run([
      "remote",
      ...(verbose ? ["-v"] : []),
    ]);
    const remotes = new Map<string, OwnedGitRemote>();

    for (const line of output.split("\n")) {
      const match = /^(\S+)\s+(.+)\s+\((fetch|push)\)$/.exec(line);
      if (!match) continue;
      const [, name, url, direction] = match;
      if (!name || !url || !direction) continue;
      const remote = remotes.get(name) ?? {
        name,
        refs: { fetch: "", push: "" },
      };
      if (direction === "fetch") {
        remote.refs.fetch = url;
      } else {
        remote.refs.push = url;
      }
      remotes.set(name, remote);
    }

    return [...remotes.values()];
  }

  async log(options?: { maxCount?: number }): Promise<OwnedGitLogResult> {
    const output = await this.runner.run([
      "log",
      ...(options?.maxCount ? [`--max-count=${options.maxCount}`] : []),
      "--format=%H",
    ]);
    const all = output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((hash) => ({ hash }));
    return { all, latest: all[0] ?? null };
  }

  async status(): Promise<OwnedGitStatus> {
    const output = await this.runner.run([
      "status",
      "--porcelain=v1",
      "--branch",
      "-z",
    ]);
    return parseOwnedGitStatus(output);
  }
}

export function parseOwnedGitStatus(output: string): OwnedGitStatus {
  const entries = output.split("\0");
  const header = entries.shift() ?? "";
  const files: OwnedGitStatusFile[] = [];
  const modified: string[] = [];
  const notAdded: string[] = [];
  const deleted: string[] = [];
  const created: string[] = [];
  const conflicted: string[] = [];
  const staged: string[] = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const indexStatus = code[0] ?? " ";
    const worktreeStatus = code[1] ?? " ";
    const path = entry.slice(3);
    if (indexStatus === "R" || indexStatus === "C") index++;

    files.push({ path, index: indexStatus, working_dir: worktreeStatus });
    if (code === "??") notAdded.push(path);
    if (indexStatus === "M" || worktreeStatus === "M") modified.push(path);
    if (indexStatus === "D" || worktreeStatus === "D") deleted.push(path);
    if (indexStatus === "A") created.push(path);
    if (CONFLICT_CODES.has(code)) conflicted.push(path);
    if (
      indexStatus !== " " &&
      indexStatus !== "?" &&
      !CONFLICT_CODES.has(code)
    ) {
      staged.push(path);
    }
  }

  const ahead = Number(/\bahead (\d+)/.exec(header)?.[1] ?? 0);
  const behind = Number(/\bbehind (\d+)/.exec(header)?.[1] ?? 0);
  const description = header.startsWith("## ") ? header.slice(3) : header;
  let current: string | null;
  if (description.startsWith("HEAD ")) {
    current = null;
  } else if (description.startsWith("No commits yet on ")) {
    current = description.slice("No commits yet on ".length);
  } else if (description.startsWith("Initial commit on ")) {
    current = description.slice("Initial commit on ".length);
  } else {
    const branchName = description.split("...")[0]?.split(" ")[0];
    current = branchName?.length ? branchName : null;
  }

  return {
    current,
    ahead,
    behind,
    files,
    modified,
    not_added: notAdded,
    deleted,
    created,
    conflicted,
    staged,
    isClean: () => files.length === 0,
  };
}
