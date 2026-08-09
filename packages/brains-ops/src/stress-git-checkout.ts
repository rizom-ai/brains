import {
  commandError,
  requireCommand,
  type StressCommandResult,
  type StressCommandRunner,
} from "./stress-command";

const gitCredentialHelper =
  '!f() { test "$1" = get && echo username=x-access-token && echo "password=$GH_TOKEN"; }; f';

/**
 * Git operations against one content-repo checkout, executed through a
 * stress command runner with token-bearing credentials.
 */
export class GitCheckout {
  readonly #runner: StressCommandRunner;
  readonly #token: string;
  public readonly dir: string;

  constructor(runner: StressCommandRunner, dir: string, token: string) {
    this.#runner = runner;
    this.dir = dir;
    this.#token = token;
  }

  /** Clone `repository`'s main branch into `dir` and pin it to origin/main. */
  static async clone(
    runner: StressCommandRunner,
    repository: string,
    dir: string,
    token: string,
  ): Promise<GitCheckout> {
    const checkout = new GitCheckout(runner, dir, token);
    await requireCommand(
      runner,
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        `credential.helper=${gitCredentialHelper}`,
        "clone",
        "--branch",
        "main",
        "--single-branch",
        `https://github.com/${repository}.git`,
        dir,
      ],
      { env: checkout.environment() },
    );
    await checkout.run([
      "config",
      "--local",
      "credential.helper",
      gitCredentialHelper,
    ]);
    await checkout.run(["reset", "--hard", "origin/main"]);
    return checkout;
  }

  async run(
    args: readonly string[],
    required = true,
  ): Promise<StressCommandResult> {
    const result = await this.#runner("git", args, {
      cwd: this.dir,
      env: this.environment(),
    });
    if (required && result.exitCode !== 0) {
      throw commandError("git", args, result);
    }
    return result;
  }

  async output(args: readonly string[]): Promise<string> {
    const result = await this.run(args);
    return result.stdout.trim();
  }

  async sync(hardReset = false): Promise<void> {
    await this.run(["fetch", "origin", "main"]);
    if (hardReset) {
      await this.run(["reset", "--hard", "origin/main"]);
    } else {
      await this.run(["pull", "--rebase", "origin", "main"]);
    }
  }

  /** Stage everything and commit as the ops identity. */
  async commitAll(message: string): Promise<void> {
    await this.run(["add", "-A"]);
    await this.run([
      "-c",
      "user.name=brains-ops",
      "-c",
      "user.email=ops@rizom.ai",
      "commit",
      "-m",
      message,
    ]);
  }

  async pushMainWithRebase(): Promise<void> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const push = await this.run(["push", "origin", "main"], false);
      if (push.exitCode === 0) return;
      await this.run(["pull", "--rebase", "origin", "main"]);
    }
    throw new Error("Unable to push content main after five rebase attempts");
  }

  /** Delete every remote stress backup branch; returns the deleted names. */
  async pruneStressBackupBranches(): Promise<string[]> {
    const result = await this.run([
      "ls-remote",
      "--heads",
      "origin",
      "refs/heads/ops/directory-sync-stress-backup-*",
    ]);
    const branches = result.stdout
      .split(/\r?\n/)
      .map(
        (line) =>
          line.match(
            /\trefs\/heads\/(ops\/directory-sync-stress-backup-[^\s]+)$/,
          )?.[1],
      )
      .filter((branch): branch is string => branch !== undefined)
      .sort();
    for (const branch of branches) {
      await this.run(["push", "origin", "--delete", branch]);
    }
    return branches;
  }

  private environment(): NodeJS.ProcessEnv {
    return { GH_TOKEN: this.#token, GITHUB_TOKEN: this.#token };
  }
}
