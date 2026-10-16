import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyMigrations } from "../src/copy-migrations";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "copy-migrations-"));
  created.push(dir);
  return dir;
}

async function migrationSource(
  root: string,
  name: string,
  files: string[],
): Promise<string> {
  const path = join(root, name);
  await mkdir(join(path, "meta"), { recursive: true });
  await Promise.all(
    files.map((file) => writeFile(join(path, file), `-- ${file}\n`)),
  );
  return path;
}

describe("copyMigrations", () => {
  it("drops migrations a previous build left behind", async () => {
    const root = await tempDir();
    const migrationsDir = join(root, "dist", "migrations");
    await mkdir(join(migrationsDir, "entity-service"), { recursive: true });
    await writeFile(
      join(migrationsDir, "entity-service", "0012_renumbered.sql"),
      "-- stale\n",
    );
    const source = await migrationSource(root, "entity", [
      "0012_index.sql",
      "0013_renumbered.sql",
    ]);

    copyMigrations([{ name: "entity-service", path: source }], migrationsDir);

    expect(
      (await readdir(join(migrationsDir, "entity-service"))).sort(),
    ).toEqual(["0012_index.sql", "0013_renumbered.sql", "meta"]);
  });

  it("copies each source under its name and skips sources that do not exist", async () => {
    const root = await tempDir();
    const migrationsDir = join(root, "dist", "migrations");
    const auth = await migrationSource(root, "auth", ["0000_auth.sql"]);

    const copied = copyMigrations(
      [
        { name: "auth-service", path: auth },
        { name: "missing-service", path: join(root, "missing") },
      ],
      migrationsDir,
    );

    expect(copied).toEqual(["auth-service"]);
    expect(
      existsSync(join(migrationsDir, "auth-service", "0000_auth.sql")),
    ).toBe(true);
    expect(existsSync(join(migrationsDir, "missing-service"))).toBe(false);
  });
});
