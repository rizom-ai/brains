import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import type { IGitSync } from "../../src/types";
import { createBrokerGitSync } from "./broker-git-sync";
import { runGit } from "./real-git";

const BASE = ["# Post", "", "First paragraph.", "", "Second paragraph.", ""];
const text = (lines: string[]): string => lines.join("\n");

/**
 * A pull merges what the remote changed with what the brain changed. Where
 * git cannot merge the two, the brain's side stays and the remote's text is
 * handed back, to be kept as a conflict.
 */
describe("a pull over changes the brain made", () => {
  let testDir: string;
  let remoteDir: string;
  let dataDir: string;
  let cloneDir: string;
  let gitSync: IGitSync;

  const local = (path: string): string => join(dataDir, path);
  const remote = (path: string): string => join(cloneDir, path);

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), "test-pull-conflicts-"));
    remoteDir = join(testDir, "remote.git");
    dataDir = join(testDir, "brain-data");
    cloneDir = join(testDir, "clone");
    mkdirSync(remoteDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    await runGit(["init", "--bare", "--initial-branch=main"], remoteDir);
    gitSync = await createBrokerGitSync({
      logger: createSilentLogger(),
      dataDir,
      gitUrl: remoteDir,
      authorName: "Test",
      authorEmail: "test@example.com",
    });
    await gitSync.initialize();

    // One post both sides start from.
    mkdirSync(local("post"), { recursive: true });
    writeFileSync(local("post/a.md"), text(BASE));
    await gitSync.commit("base");
    await gitSync.push();
    await runGit(["clone", remoteDir, cloneDir], testDir);
    await runGit(["config", "user.name", "Remote"], cloneDir);
    await runGit(["config", "user.email", "remote@test.com"], cloneDir);
  });

  afterEach(async () => {
    await gitSync.cleanup();
    rmSync(testDir, { recursive: true, force: true });
  });

  const pushRemote = async (message: string): Promise<void> => {
    await runGit(["add", "-A"], cloneDir);
    await runGit(["commit", "-m", message], cloneDir);
    await runGit(["push"], cloneDir);
  };
  const brainWrites = async (lines: string[]): Promise<void> => {
    writeFileSync(local("post/a.md"), text(lines));
    await gitSync.commit("the brain's export");
  };
  const withLine = (index: number, line: string): string[] =>
    BASE.map((current, at) => (at === index ? line : current));

  it("takes a remote edit to a file the brain has not changed", async () => {
    writeFileSync(remote("post/a.md"), text(withLine(2, "Edited remotely.")));
    await pushRemote("remote edit");

    const result = await gitSync.pull();

    expect(readFileSync(local("post/a.md"), "utf8")).toBe(
      text(withLine(2, "Edited remotely.")),
    );
    expect(result.files).toContain("post/a.md");
    expect(result.conflicts ?? []).toEqual([]);
  });

  it("merges edits to different parts of a file", async () => {
    await brainWrites(withLine(2, "Edited in the brain."));
    writeFileSync(remote("post/a.md"), text(withLine(4, "Edited remotely.")));
    await pushRemote("remote edit");

    const result = await gitSync.pull();

    expect(readFileSync(local("post/a.md"), "utf8")).toBe(
      text(["# Post", "", "Edited in the brain.", "", "Edited remotely.", ""]),
    );
    expect(result.conflicts ?? []).toEqual([]);
  });

  it("keeps the brain's side of overlapping edits and hands back the remote's text", async () => {
    await brainWrites(withLine(2, "Edited in the brain."));
    writeFileSync(remote("post/a.md"), text(withLine(2, "Edited remotely.")));
    await pushRemote("remote edit");

    const result = await gitSync.pull();

    expect(readFileSync(local("post/a.md"), "utf8")).toBe(
      text(withLine(2, "Edited in the brain.")),
    );
    expect(
      (result.conflicts ?? []).map(({ path, text: lost }) => ({ path, lost })),
    ).toEqual([
      { path: "post/a.md", lost: text(withLine(2, "Edited remotely.")) },
    ]);
    // The checkout is clean and ahead of the remote: nothing is left to merge.
    expect((await runGit(["status", "--porcelain"], dataDir)).trim()).toBe("");
  });

  it("hands a remote text back on every pull until it is acknowledged", async () => {
    await brainWrites(withLine(2, "Edited in the brain."));
    writeFileSync(remote("post/a.md"), text(withLine(2, "Edited remotely.")));
    await pushRemote("remote edit");
    const first = (await gitSync.pull()).conflicts ?? [];
    expect(first).toHaveLength(1);

    const again = (await gitSync.pull()).conflicts ?? [];
    expect(again).toEqual(first);

    await gitSync.acknowledgePullConflicts(first.map(({ id }) => id));
    expect((await gitSync.pull()).conflicts ?? []).toEqual([]);
  });

  it("keeps a file the brain changed when the remote deleted it", async () => {
    await brainWrites(withLine(2, "Edited in the brain."));
    const { checkpoint } = await gitSync.getReconciliationDelta(undefined);
    await runGit(["rm", "post/a.md"], cloneDir);
    await pushRemote("remote delete");

    const result = await gitSync.pull();

    expect(readFileSync(local("post/a.md"), "utf8")).toBe(
      text(withLine(2, "Edited in the brain.")),
    );
    expect(result.deletedFiles ?? []).toEqual([]);
    expect(result.conflicts ?? []).toEqual([]);
    const delta = await gitSync.getReconciliationDelta(checkpoint);
    if (delta.mode !== "incremental") throw new Error("Expected a delta");
    expect(delta.deletedFiles).toEqual([]);
  });

  it("still deletes a file the brain has not changed when the remote deleted it", async () => {
    await runGit(["rm", "post/a.md"], cloneDir);
    await pushRemote("remote delete");

    const result = await gitSync.pull();

    expect(existsSync(local("post/a.md"))).toBe(false);
    expect(result.deletedFiles).toEqual(["post/a.md"]);
  });

  it("restores a file the brain deleted when the remote changed it", async () => {
    rmSync(local("post/a.md"));
    await gitSync.commit("the brain's delete");
    writeFileSync(remote("post/a.md"), text(withLine(2, "Edited remotely.")));
    await pushRemote("remote edit");

    const result = await gitSync.pull();

    expect(readFileSync(local("post/a.md"), "utf8")).toBe(
      text(withLine(2, "Edited remotely.")),
    );
    expect(result.conflicts ?? []).toEqual([]);
  });
});
