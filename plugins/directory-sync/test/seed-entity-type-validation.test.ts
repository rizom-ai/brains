import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { validateSeedContentEntityTypes } from "../src/lib/file-discovery";

const tempDirectories: string[] = [];

async function createSeedDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "directory-sync-seed-types-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("strict seed entity type validation", () => {
  test("accepts root notes and registered entity directories", async () => {
    const directory = await createSeedDirectory();
    await mkdir(join(directory, "link"));
    await writeFile(join(directory, "README.md"), "# Seed\n");
    await writeFile(join(directory, "link", "example.md"), "# Link\n");

    await validateSeedContentEntityTypes(directory, {
      hasEntityType: (type) => type === "note" || type === "link",
    });
  });

  test("rejects every seeded type the brain did not register", async () => {
    const directory = await createSeedDirectory();
    await mkdir(join(directory, "swot"));
    await mkdir(join(directory, "deck", "nested"), { recursive: true });
    await writeFile(join(directory, "swot", "assessment.md"), "# SWOT\n");
    await writeFile(join(directory, "deck", "nested", "pitch.md"), "# Deck\n");

    let validationError: unknown;
    try {
      await validateSeedContentEntityTypes(directory, {
        hasEntityType: () => false,
      });
    } catch (error) {
      validationError = error;
    }
    expect(validationError).toBeInstanceOf(Error);
    expect((validationError as Error).message).toContain(
      "Seed content contains unregistered entity types: deck, swot",
    );
  });

  test("ignores hidden metadata and directories without sync files", async () => {
    const directory = await createSeedDirectory();
    await mkdir(join(directory, ".git"));
    await mkdir(join(directory, "assets"));
    await writeFile(join(directory, ".git", "config"), "metadata\n");
    await writeFile(join(directory, "assets", "theme.css"), "body {}\n");

    await validateSeedContentEntityTypes(directory, {
      hasEntityType: () => false,
    });
  });
});
