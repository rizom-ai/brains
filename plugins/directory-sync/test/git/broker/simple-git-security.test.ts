import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { getErrorMessage } from "@brains/utils/error";
import { MANAGED_GIT_CONFIG_ARGS } from "../../../src/lib/broker/git-credentials";

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "simple-git-security-"));
  // Git parses repository-specific options only after finding a repository.
  await managedClient().init();
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function managedClient(): SimpleGit {
  return simpleGit(scratch, {
    config: MANAGED_GIT_CONFIG_ARGS,
    unsafe: { allowUnsafeHooksPath: true },
  });
}

async function expectBlocked(
  operation: PromiseLike<string>,
  message: RegExp,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(getErrorMessage(error, "")).toMatch(message);
    return;
  }
  throw new Error("Expected the Git security guard to reject the operation");
}

describe("simple-git managed-client security", () => {
  it("keeps managed settings invocation-local and ordinary status usable", async () => {
    const git = managedClient();
    expect((await git.raw(["config", "--get", "core.hooksPath"])).trim()).toBe(
      "/dev/null",
    );
    expect(
      (await git.raw(["config", "--get", "maintenance.auto"])).trim(),
    ).toBe("false");
    expect(await git.raw(["status", "--porcelain"])).toBe("");
    const config = await readFile(join(scratch, ".git", "config"), "utf8");
    expect(config).not.toContain("hooksPath");
    expect(config).not.toContain("maintenance");
  });

  it("allows disabling hooks without permitting Git config includes", async () => {
    const included = join(scratch, "included-config");
    await writeFile(included, "[review]\n  marker = local-fixture\n");
    await expectBlocked(
      managedClient().raw([
        "-c",
        `include.path=${included}`,
        "config",
        "--get",
        "review.marker",
      ]),
      /include\.path.*not permitted.*allowUnsafeInclude/,
    );
  });

  it("blocks command configuration in commit trailers", async () => {
    await expectBlocked(
      managedClient().raw([
        "-c",
        "trailer.review.command=untrusted-command",
        "status",
      ]),
      /trailer\.command.*not permitted.*allowUnsafeCommandBinaries/,
    );
  });

  it("blocks abbreviated executable options", async () => {
    await expectBlocked(
      managedClient().raw(["push", "--receive-p=untrusted-command", "origin"]),
      /abbreviated options/i,
    );
  });

  it("rejects an explicitly supplied VISUAL editor", async () => {
    await expectBlocked(
      managedClient()
        .env({
          PATH: process.env["PATH"] ?? "",
          HOME: homedir(),
          VISUAL: "untrusted-editor",
        })
        .raw(["status"]),
      /"VISUAL".*not permitted.*allowUnsafeEditor/,
    );
  });
});
