import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { createBrokerGitSync } from "../broker-git-sync";
import { commitTouching, runGit } from "../real-git";

/**
 * Review blocker 8.
 *
 * Managed operations run with hooks disabled. A hook is arbitrary code the
 * broker did not sanction, running inside the checkout turn and inside the
 * broker's process group — it can block the turn indefinitely, or detach and
 * outlive the group the supervisor is about to prove empty. The plan requires
 * that hooks and automatic maintenance cannot escape the broker, and the
 * simplest way to guarantee that is not to run them.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

async function checkoutWithHook(script: string[]): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "managed-hooks-"));
  const checkout = join(scratch, "checkout");
  const hooks = join(scratch, "hooks");
  await mkdir(hooks, { recursive: true });
  await writeFile(join(hooks, "pre-commit"), script.join("\n"), {
    mode: 0o755,
  });
  return checkout;
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("a managed git operation", () => {
  it("does not run a hook the checkout happens to carry", async () => {
    const checkout = await checkoutWithHook([
      "#!/bin/sh",
      `touch ${join("HOOK_RAN")}`,
      "exit 1",
    ]);
    const gitSync = await createBrokerGitSync({
      logger: createSilentLogger(),
      dataDir: checkout,
      branch: "main",
      authorName: "Test",
      authorEmail: "test@example.com",
    });
    await gitSync.initialize();
    await runGit(
      ["config", "core.hooksPath", join(scratch ?? "", "hooks")],
      checkout,
    );

    // The hook exits non-zero, so a commit that ran it would fail outright.
    await writeFile(join(checkout, "note.md"), "note\n");
    await gitSync.commit("managed");

    expect(await commitTouching(checkout, "note.md")).toEqual(["note.md"]);
    expect(await Bun.file(join(checkout, "HOOK_RAN")).exists()).toBe(false);

    await gitSync.cleanup();
  }, 60_000);
});
