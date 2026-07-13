import { describe, expect, it, mock } from "bun:test";
import { createBasePluginContext } from "../src/base/context";
import { createMockShell } from "../src/test/mock-shell";

describe("plugin semantic context", () => {
  it("exposes semantic projection without exposing raw embedding access", async () => {
    const shell = createMockShell();
    const projectSemanticSpace = mock(async () => ({
      origin: { kind: "centroid" as const },
      points: [],
      neighbors: [],
      distanceRange: { min: 0, max: 0 },
    }));
    Object.assign(shell.getEntityService(), { projectSemanticSpace });

    const context = createBasePluginContext(shell, "test-plugin");
    const request = { types: ["agent"] };
    const result = await context.semantic.project(request);

    expect(result).toEqual({
      origin: { kind: "centroid" },
      points: [],
      neighbors: [],
      distanceRange: { min: 0, max: 0 },
    });
    expect(projectSemanticSpace).toHaveBeenCalledWith(request);
    expect("getEmbeddings" in context.entityService).toBe(false);
  });
});
