import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";

describe("eval DB builder", () => {
  const builderPath = join(__dirname, "../src/eval-db-builder.ts");

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
    expect(jobsDrainIndex).toBeLessThan(readinessIndex);
    expect(readinessIndex).toBeLessThan(checkpointIndex);
  });
});
