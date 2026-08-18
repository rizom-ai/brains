import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { isBrainDataEmpty } from "../src/lib/seed-content";
import { createMockGitSync } from "./fixtures";

/**
 * Seeding must not write into a checkout that already has history, and the
 * question "does this checkout have history?" is now asked of its owner.
 *
 * It used to be answered by running `rev-parse` in the app process. That is a
 * Git child against a managed checkout, which the broker design removes — see
 * docs/plans/directory-sync-git-execution-broker.md.
 */

let scratch: string | undefined;

async function emptyCheckout(): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "seed-history-"));
  const checkout = join(scratch, "brain-data");
  await mkdir(join(checkout, ".git"), { recursive: true });
  return checkout;
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("seed content history probe", () => {
  it("treats a checkout with history as non-empty", async () => {
    const checkout = await emptyCheckout();
    const getStatus = mock(async () => ({
      isRepo: true,
      hasChanges: false,
      ahead: 0,
      behind: 0,
      branch: "main",
      lastCommit: "a".repeat(40),
      files: [],
    }));

    expect(
      await isBrainDataEmpty(
        checkout,
        createSilentLogger(),
        createMockGitSync({ getStatus }),
      ),
    ).toBe(false);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("seeds an unborn checkout the owner reports has no commit", async () => {
    const checkout = await emptyCheckout();
    // `bootstrapFromSeed` inits an empty repository and then expects the seed
    // to land in it, so "is a repo" is not the same question as "has history".
    const gitSync = createMockGitSync({
      getStatus: mock(async () => ({
        isRepo: true,
        hasChanges: false,
        ahead: 0,
        behind: 0,
        branch: "main",
        files: [],
      })),
    });

    expect(
      await isBrainDataEmpty(checkout, createSilentLogger(), gitSync),
    ).toBe(true);
  });

  it("asks no owner when content is already present", async () => {
    const checkout = await emptyCheckout();
    await writeFile(join(checkout, "note.md"), "content\n");
    const getStatus = mock(async () => {
      throw new Error("The owner must not be asked when content decides it");
    });

    expect(
      await isBrainDataEmpty(
        checkout,
        createSilentLogger(),
        createMockGitSync({ getStatus }),
      ),
    ).toBe(false);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("seeds a directory that no owner manages", async () => {
    // Without configured Git sync there is no broker and no managed checkout,
    // so there is nothing to protect and nothing to ask.
    expect(
      await isBrainDataEmpty(await emptyCheckout(), createSilentLogger()),
    ).toBe(true);
  });
});
