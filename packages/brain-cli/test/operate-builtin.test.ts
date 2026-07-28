import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createTool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { operate } from "../src/commands/operate";
import { resolveRunnerType } from "../src/commands/start";
import { resetBootFn, setBootFn, type BootedBrain } from "../src/lib/boot";
import {
  resetCanonicalDefinition,
  setCanonicalDefinition,
} from "../src/lib/definition-registry";

const definition = {
  name: "brain",
  version: "1.0.0",
  capabilities: [],
  interfaces: [],
};

describe("operate with the builtin canonical definition", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-operate-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundles: [core]\n",
    );
    resetCanonicalDefinition();
    resetBootFn();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetCanonicalDefinition();
    resetBootFn();
  });

  it("detects builtin mode when the definition is registered", () => {
    setCanonicalDefinition(definition);
    expect(resolveRunnerType(testDir)).toBe("builtin");
  });

  it("has no builtin mode without a registered definition", () => {
    expect(resolveRunnerType(testDir)).toBeUndefined();
  });

  it("invokes CLI tools on the shell returned by the booted app", async () => {
    setCanonicalDefinition(definition);

    let requestedEnvironment: string | undefined;
    const buildTool = createTool(
      "site-builder",
      "build-site",
      "Build the site",
      z.object({
        environment: z.enum(["preview", "production"]).optional(),
      }),
      async (input) => {
        requestedEnvironment = input.environment;
        return { success: true, message: "build requested", data: {} };
      },
      { cli: { name: "build" } },
    );

    const bootedBrain: BootedBrain = {
      getShell: () => ({
        getMCPService: () => ({
          getCliTools: () => [{ pluginId: "site-builder", tool: buildTool }],
        }),
      }),
    };

    setBootFn(async (): Promise<BootedBrain> => bootedBrain);

    const result = await operate(testDir, "build", ["preview"], {});

    expect(result.success).toBe(true);
    expect(requestedEnvironment).toBe("preview");
  });

  it("fails gracefully without a runner or definition", async () => {
    const result = await operate(testDir, "status", [], {});
    expect(result.success).toBe(false);
    expect(result.message).toContain("Could not find brain runner");
  });
});
