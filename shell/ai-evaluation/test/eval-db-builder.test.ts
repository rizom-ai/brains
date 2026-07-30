import { readFileSync } from "fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "bun:test";
import type { AppConfig } from "@brains/app";

import { copyBuiltDatabases } from "../src/eval-db-builder";
import { resolveEvaluationContentDirectory } from "../src/eval-environment";

describe("eval DB builder", () => {
  const builderPath = join(__dirname, "../src/eval-db-builder.ts");
  const environmentPath = join(__dirname, "../src/eval-environment.ts");
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("waits for semantic index readiness before saving eval database artifacts", () => {
    const source = readFileSync(builderPath, "utf-8");

    const jobsDrainIndex = source.indexOf("waitForJobsToDrain");
    const readinessIndex = source.indexOf(
      "waitForIndexReadiness(entityService)",
    );
    const checkpointIndex = source.indexOf("checkpointDatabases");

    expect(jobsDrainIndex).toBeGreaterThan(-1);
    expect(readinessIndex).toBeGreaterThan(-1);
    expect(checkpointIndex).toBeGreaterThan(-1);
    expect(source).toContain("entityService.awaitIndexReady");
    expect(source).toContain("await app.stop()");
    expect(source).toContain("throw buildFailure");
    expect(source).not.toContain("process.exit");
    expect(jobsDrainIndex).toBeLessThan(readinessIndex);
    expect(readinessIndex).toBeLessThan(checkpointIndex);
  });

  it("writes prebuilt databases beside the configured suite content", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "eval-db-builder-"));
    tempDirs.push(tempDir);
    const evalDbBase = join(tempDir, "build");
    const suiteContentDir = join(tempDir, "eval-content", "personal");
    await mkdir(suiteContentDir, { recursive: true });
    await writeFile(`${evalDbBase}.db`, "entity-db");
    await writeFile(`${evalDbBase}-embeddings.db`, "embedding-db");

    const config = {
      plugins: [
        {
          id: "directory-sync",
          config: { seedContentPath: suiteContentDir },
        },
      ],
    } as unknown as AppConfig;
    expect(resolveEvaluationContentDirectory({ config })).toBe(suiteContentDir);

    copyBuiltDatabases(evalDbBase, suiteContentDir);

    expect(await readFile(join(suiteContentDir, "brain.db"), "utf8")).toBe(
      "entity-db",
    );
    expect(await readFile(join(suiteContentDir, "embeddings.db"), "utf8")).toBe(
      "embedding-db",
    );
  });

  it("stops a partially booted eval app before preserving the boot failure", () => {
    const source = readFileSync(environmentPath, "utf-8");

    expect(source).toContain("await app.initialize()");
    expect(source).toContain("await app.stop()");
    expect(source).toContain("throw error");
  });
});
