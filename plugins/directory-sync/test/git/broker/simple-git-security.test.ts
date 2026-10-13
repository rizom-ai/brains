import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  it("allows disabling hooks without permitting Git config includes", async () => {
    await expectBlocked(
      managedClient().raw(["-c", "include.path=untrusted-config", "status"]),
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
      managedClient().env({ VISUAL: "untrusted-editor" }).raw(["status"]),
      /"VISUAL".*not permitted.*allowUnsafeEditor/,
    );
  });
});
