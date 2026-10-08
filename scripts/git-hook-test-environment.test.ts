import { expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("keeps commit metadata out of fixture Git commands, including loose Turbo environments", async () => {
  const root = await mkdtemp(join(tmpdir(), "hook-git-environment-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  try {
    const host = join(root, "host");
    const foreign = join(root, "foreign");
    const bin = join(root, "bin");
    await mkdir(foreign);
    await mkdir(bin);
    const initialized = Bun.spawnSync(["git", "init", "-q", host], { env });
    expect(initialized.exitCode).toBe(0);
    const head = await readFile(join(host, ".git/HEAD"), "utf8");
    // The real hook block invokes this stand-in test process. All Git writes
    // are confined to disposable fixtures, including the intentionally hostile
    // inherited metadata pointers.
    await writeFile(
      join(bin, "bun"),
      '#!/bin/sh\nset -eu\ncd "$FOREIGN_REPO"\ngit init -q\n',
      { mode: 0o755 },
    );
    const hook = await readFile(
      join(import.meta.dir, "../.husky/pre-commit"),
      "utf8",
    );
    const block = hook.match(/^ {2}\(\n[\s\S]*?^ {2}\)/mu)?.[0];
    if (!block) throw new Error("Missing isolated hook test process");
    const child = Bun.spawnSync(["sh", "-e", "-c", block], {
      cwd: host,
      env: {
        ...env,
        PATH: `${bin}:${env["PATH"] ?? ""}`,
        FOREIGN_REPO: foreign,
        TURBO_ENV_MODE: "loose",
        GIT_DIR: join(host, ".git"),
        GIT_COMMON_DIR: join(host, ".git"),
        GIT_WORK_TREE: host,
        GIT_INDEX_FILE: join(host, ".git/index"),
      },
    });
    expect(child.stderr.toString()).toBe("");
    expect(child.exitCode).toBe(0);
    expect(await readFile(join(foreign, ".git/HEAD"), "utf8")).toBe(head);
    expect(await readFile(join(host, ".git/HEAD"), "utf8")).toBe(head);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
