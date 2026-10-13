import { afterEach, expect, test } from "bun:test";
import { caughtError } from "@brains/test-utils";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  migratePrereleaseHistory,
  parsePrereleaseState,
  readPrereleaseHistory,
} from "../src/prerelease-history";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function expectFailure(
  operation: Promise<unknown>,
  message?: string,
): Promise<void> {
  const error = await operation.then(() => undefined, caughtError);
  expect(error).toBeInstanceOf(Error);
  if (message !== undefined) expect(error?.message).toContain(message);
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "prerelease-history-test-"));
  fixtures.push(root);
  await mkdir(join(root, ".changeset"));
  await writeFile(
    join(root, ".changeset", "pre.json"),
    JSON.stringify({
      mode: "pre",
      tag: "alpha",
      initialVersions: { "@rizom/brain": "0.2.0" },
      changesets: ["core--past", "site--past", "already-removed"],
    }),
  );
  for (const name of [
    "core--past",
    "site--past",
    "core--fresh",
    "site--fresh",
  ]) {
    await writeFile(
      join(root, ".changeset", `${name}.md`),
      `---\n"@rizom/${name.startsWith("site") ? "site-fixture" : "brain"}": patch\n---\n\nExact ${name} source.\n`,
    );
  }
  return root;
}

test("legacy checks are read-only and exclude consumed root files", async () => {
  const root = await fixture();
  const before = await readFile(join(root, ".changeset", "pre.json"), "utf8");
  const history = await readPrereleaseHistory(root);
  expect(history.pendingFiles).toEqual(["core--fresh.md", "site--fresh.md"]);
  expect(history.consumedFiles).toEqual(["core--past.md", "site--past.md"]);
  expect(await readFile(join(root, ".changeset", "pre.json"), "utf8")).toBe(
    before,
  );
  expect(await readdir(join(root, ".changeset"))).not.toContain("pre");
});

test("one-time migration preserves every Markdown byte and queued lane", async () => {
  const root = await fixture();
  const sources = await Promise.all(
    ["core--past.md", "site--past.md"].map((file) =>
      readFile(join(root, ".changeset", file), "utf8"),
    ),
  );
  await migratePrereleaseHistory(root);
  const state = parsePrereleaseState(
    await readFile(join(root, ".changeset", "pre.json"), "utf8"),
  );
  expect(state).toEqual({ mode: "pre", tag: "alpha" });
  const history = await readPrereleaseHistory(root);
  expect(history.pendingFiles).toEqual(["core--fresh.md", "site--fresh.md"]);
  expect(history.consumedFiles).toEqual([
    "pre/core--past.md",
    "pre/site--past.md",
  ]);
  expect(
    await Promise.all(
      ["core--past.md", "site--past.md"].map((file) =>
        readFile(join(root, ".changeset", "pre", file), "utf8"),
      ),
    ),
  ).toEqual(sources);
  expect(await readdir(join(root, ".changeset"))).not.toContain(
    ".pre-migration.lock",
  );
  await migratePrereleaseHistory(root);
  expect(await readPrereleaseHistory(root)).toEqual(history);
});

test("state-commit failure restores all moved sources and old metadata", async () => {
  const root = await fixture();
  const before = await readFile(join(root, ".changeset", "pre.json"), "utf8");
  await writeFile(
    join(root, ".changeset", ".pre-migration.json"),
    "Other owner's file.",
  );
  await expectFailure(migratePrereleaseHistory(root));
  expect(await readFile(join(root, ".changeset", "pre.json"), "utf8")).toBe(
    before,
  );
  expect((await readPrereleaseHistory(root)).consumedFiles).toEqual([
    "core--past.md",
    "site--past.md",
  ]);
  expect(
    await readFile(join(root, ".changeset", ".pre-migration.json"), "utf8"),
  ).toBe("Other owner's file.");
  expect(await readdir(join(root, ".changeset"))).not.toContain("pre");
  expect(await readdir(join(root, ".changeset"))).not.toContain(
    ".pre-migration.lock",
  );
});

test("an archive collision fails without overwriting either source", async () => {
  const root = await fixture();
  await mkdir(join(root, ".changeset", "pre"));
  await writeFile(
    join(root, ".changeset", "pre", "site--past.md"),
    "Distinct archive bytes.",
  );
  await expectFailure(
    migratePrereleaseHistory(root),
    "Duplicate prerelease history",
  );
  expect(
    await readFile(join(root, ".changeset", "pre", "site--past.md"), "utf8"),
  ).toBe("Distinct archive bytes.");
  expect(
    await readFile(join(root, ".changeset", "site--past.md"), "utf8"),
  ).toContain("Exact site--past source.");
  expect(await readdir(join(root, ".changeset"))).not.toContain(
    ".pre-migration.lock",
  );
});

test("archive history is inspected even without fresh work", async () => {
  const root = await fixture();
  await migratePrereleaseHistory(root);
  await rm(join(root, ".changeset", "core--fresh.md"));
  await rm(join(root, ".changeset", "site--fresh.md"));
  expect((await readPrereleaseHistory(root)).consumedFiles).toHaveLength(2);
  expect((await readPrereleaseHistory(root)).pendingFiles).toEqual([]);
});

test("a held migration lock is neither bypassed nor deleted", async () => {
  const root = await fixture();
  await writeFile(
    join(root, ".changeset", ".pre-migration.lock"),
    "Other owner's lock.",
  );
  await expectFailure(migratePrereleaseHistory(root));
  expect(
    await readFile(join(root, ".changeset", ".pre-migration.lock"), "utf8"),
  ).toBe("Other owner's lock.");
});

test("malformed/unsafe state is rejected before migration", async () => {
  const root = await fixture();
  for (const changesets of [
    ["../outside"],
    ["folder\\outside"],
    [".."],
    ["bad\0name"],
  ]) {
    await writeFile(
      join(root, ".changeset", "pre.json"),
      JSON.stringify({ mode: "pre", tag: "alpha", changesets }),
    );
    await expectFailure(migratePrereleaseHistory(root), "file basenames");
  }
  expect(() =>
    parsePrereleaseState(
      '{"mode":"pre","tag":"alpha","unknown":"must not be dropped"}',
    ),
  ).toThrow();
  expect(() =>
    parsePrereleaseState('{"mode":"invalid","tag":"alpha"}'),
  ).toThrow();
});

test("history symlinks are rejected without following their contents", async () => {
  const root = await fixture();
  await symlink(
    join(root, "nonexistent-target"),
    join(root, ".changeset", "core--link.md"),
  );
  await expectFailure(readPrereleaseHistory(root), "Not a regular changeset");
});

test("archive directory symlinks are rejected", async () => {
  const root = await fixture();
  await symlink(root, join(root, ".changeset", "pre"));
  await expectFailure(readPrereleaseHistory(root), "Not a history directory");
});
