import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { ReconciliationGit } from "../../src/lib/git-remote-deletion-reconciliation";
import { createSilentLogger } from "@brains/test-utils";
import { reconcileRemoteDeletedFiles } from "../../src/lib/git-remote-deletion-reconciliation";

describe("reconcileRemoteDeletedFiles", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it("removes and commits a pull path that is absent from the remote tree", async () => {
    const syncPath = mkdtempSync(join(tmpdir(), "remote-delete-reconcile-"));
    roots.push(syncPath);
    const resurrectedPath = join(syncPath, "resurrected.md");
    writeFileSync(resurrectedPath, "should remain deleted remotely");
    const add = mock(async () => "");
    const diff = mock(async () => "resurrected.md\n");
    const commit = mock(async () => ({ commit: "reconciled" }));
    const logger = createSilentLogger("remote-delete-reconcile");
    const warn = spyOn(logger, "warn");

    const reconciled = await reconcileRemoteDeletedFiles({
      git: { add, diff, commit } satisfies ReconciliationGit,
      logger,
      syncPath,
      deletedFiles: ["resurrected.md"],
    });

    expect(reconciled).toEqual(["resurrected.md"]);
    expect(existsSync(resurrectedPath)).toBe(false);
    expect(add).toHaveBeenCalledWith(["-A", "--", "resurrected.md"]);
    expect(commit).toHaveBeenCalledWith(
      "Reconcile remote deletions (remote wins)",
    );
    expect(warn).toHaveBeenCalledWith(
      "Removed locally resurrected remote deletion",
      { path: "resurrected.md" },
    );
  });

  it("does not create an empty commit for an untracked late export", async () => {
    const syncPath = mkdtempSync(join(tmpdir(), "remote-delete-untracked-"));
    roots.push(syncPath);
    writeFileSync(join(syncPath, "late-export.md"), "late export");
    const add = mock(async () => "");
    const diff = mock(async () => "");
    const commit = mock(async () => ({ commit: "unexpected" }));

    await reconcileRemoteDeletedFiles({
      git: { add, diff, commit } satisfies ReconciliationGit,
      logger: createSilentLogger("remote-delete-untracked"),
      syncPath,
      deletedFiles: ["late-export.md"],
    });

    expect(existsSync(join(syncPath, "late-export.md"))).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });
});
