import { describe, expect, it, mock } from "bun:test";
import { OwnedGit } from "../../src/lib/owned-git";
import type {
  GitCommandOptions,
  GitCommandRunner,
} from "../../src/lib/owned-git";

function createRunner(
  outputs: Record<string, string> = {},
): GitCommandRunner & { run: ReturnType<typeof mock> } {
  const run = mock(
    async (args: readonly string[]) => outputs[args.join(" ")] ?? "",
  );
  return { run };
}

describe("OwnedGit", () => {
  it("routes local Git commands through its one owned command runner", async () => {
    const runner = createRunner({
      "rev-parse HEAD": "abc123\n",
      "diff --cached --name-only": "note.md\n",
      "show HEAD:note.md": "content",
    });
    const git = new OwnedGit(runner);

    expect(await git.revparse(["HEAD"])).toBe("abc123");
    expect(await git.diff(["--cached", "--name-only"])).toBe("note.md\n");
    await git.add(["-A"]);
    expect(await git.show(["HEAD:note.md"])).toBe("content");

    expect(runner.run.mock.calls.map(([args]) => args)).toEqual([
      ["rev-parse", "HEAD"],
      ["diff", "--cached", "--name-only"],
      ["add", "-A"],
      ["show", "HEAD:note.md"],
    ]);
  });

  it("applies scoped cancellation and progress to every command", async () => {
    const observedOptions: Array<GitCommandOptions | undefined> = [];
    const runner: GitCommandRunner = {
      async run(args, options): Promise<string> {
        observedOptions.push(options);
        return args[0] === "status" ? "## main\0" : "abc123\n";
      },
    };
    const controller = new AbortController();
    const onProgress = (): void => {};
    const git = new OwnedGit(runner).withOptions({
      signal: controller.signal,
      onProgress,
    });

    await git.status();
    await git.revparse(["HEAD"]);

    expect(observedOptions).toEqual([
      { signal: controller.signal, onProgress },
      { signal: controller.signal, onProgress },
    ]);
  });

  it("parses porcelain status without losing paths containing spaces", async () => {
    const runner = createRunner({
      "status --porcelain=v1 --branch -z":
        "## main...origin/main [ahead 2, behind 1]\0 M note with spaces.md\0A  created.md\0?? new.md\0UU conflict.md\0",
    });
    const git = new OwnedGit(runner);

    const status = await git.status();

    expect(status.current).toBe("main");
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(1);
    expect(status.modified).toEqual(["note with spaces.md"]);
    expect(status.created).toEqual(["created.md"]);
    expect(status.not_added).toEqual(["new.md"]);
    expect(status.conflicted).toEqual(["conflict.md"]);
    expect(status.staged).toEqual(["created.md"]);
    expect(status.isClean()).toBe(false);
  });
});
