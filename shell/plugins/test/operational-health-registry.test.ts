import { describe, expect, it } from "bun:test";
import { OperationalHealthRegistry } from "../src/operational-health-registry";

describe("OperationalHealthRegistry", () => {
  it("collects schema-validated plugin checks and unregisters by owner", async () => {
    const registry = new OperationalHealthRegistry();
    registry.register("directory-sync", "git-progress", async () => ({
      status: "degraded",
      message: "Git pull is stale",
      details: { inactivityMs: 150_001 },
    }));

    expect(await registry.getChecks()).toEqual([
      {
        name: "directory-sync:git-progress",
        status: "degraded",
        message: "Git pull is stale",
        details: { inactivityMs: 150_001 },
      },
    ]);

    registry.unregisterPlugin("directory-sync");
    expect(await registry.getChecks()).toEqual([]);
  });

  it("contains provider failures without exposing their error detail", async () => {
    const registry = new OperationalHealthRegistry();
    registry.register("directory-sync", "git-progress", async () => {
      throw new Error("https://operator:secret@example.com/content.git");
    });

    expect(await registry.getChecks()).toEqual([
      {
        name: "directory-sync:git-progress",
        status: "degraded",
        message: "Operational health check failed",
      },
    ]);
  });
});
