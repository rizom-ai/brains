import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { CheckoutOperationExecutor } from "../../../src/lib/broker/checkout-executor";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";
import { commitTouching } from "../real-git";

const LINUX = process.platform === "linux";
let scratch: string | undefined;

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("a lost Git completion", () => {
  it("keeps the turn owned after Git has exited and the mutation landed", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-completion-loss-"));
    const completionWithheld = Promise.withResolvers<void>();
    const neverCompletes = new Promise<void>(() => {});
    const executor = new CheckoutOperationExecutor({
      logger: createSilentLogger(),
      dataDir: scratch,
      branch: "main",
      remoteUrl: "",
      remoteFingerprint: getGitRemoteFingerprint(""),
      timeoutMs: 30_000,
      authorName: "Test",
      authorEmail: "test@example.com",
      afterOperation: async (operation): Promise<void> => {
        if (operation.name !== "commit") return;
        completionWithheld.resolve();
        await neverCompletes;
      },
    });
    await executor.execute({ name: "initialize" });
    await writeFile(join(scratch, "note.md"), "landed\n");

    const lost = executor.execute({ name: "commit" });
    await completionWithheld.promise;
    expect(await commitTouching(scratch, "note.md")).toEqual(["note.md"]);

    let queuedStarted = false;
    const queued = executor.execute(
      { name: "get-status" },
      { onStart: () => void (queuedStarted = true) },
    );
    await Bun.sleep(25);
    expect(queuedStarted).toBe(false);

    // Both promises deliberately remain owned by this executor. The process
    // supervisor, not an in-process timeout or unlock, removes the owner group.
    void lost;
    void queued;
  });
});
