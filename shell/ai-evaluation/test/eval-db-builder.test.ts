import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "bun:test";

describe("eval DB builder", () => {
  const builderPath = join(__dirname, "../src/eval-db-builder.ts");
  const environmentPath = join(__dirname, "../src/eval-environment.ts");

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

  it("stops a partially booted eval app before preserving the boot failure", () => {
    const source = readFileSync(environmentPath, "utf-8");

    expect(source).toContain("await app.initialize()");
    expect(source).toContain("await app.stop()");
    expect(source).toContain("throw error");
  });
});
