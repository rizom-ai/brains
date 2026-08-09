import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createTool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { commands } from "../src/run-command";
import { operate, operateRawTool } from "../src/commands/operate";
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
    testDir = mkdtempSync(join(tmpdir(), "brain-operate-test-"));
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
          listTools: () => [{ pluginId: "site-builder", tool: buildTool }],
        }),
      }),
    };

    setBootFn(async (): Promise<BootedBrain> => bootedBrain);

    const result = await operate(testDir, "build", ["preview"], {});

    expect(result.success).toBe(true);
    expect(requestedEnvironment).toBe("preview");
  });

  it("replays generated confirmation args for bundled raw tools", async () => {
    setCanonicalDefinition(definition);
    let confirmedInput: unknown;
    const writeTool = createTool(
      "fixture",
      "write",
      "Write fixture data",
      z.object({
        value: z.string(),
        confirmed: z.literal(true).optional(),
        confirmationToken: z.string().optional(),
      }),
      async (input) => {
        if (!input.confirmed) {
          return {
            needsConfirmation: true,
            toolName: "fixture_write",
            summary: "Write fixture data?",
            args: {
              ...input,
              confirmed: true,
              confirmationToken: "generated-token",
            },
          };
        }
        confirmedInput = input;
        return { success: true, data: { written: input.value } };
      },
    );
    let stopped = false;
    setBootFn(async (): Promise<BootedBrain> => ({
      getShell: () => ({
        getMCPService: () => ({
          getCliTools: () => [],
          listTools: () => [{ pluginId: "fixture", tool: writeTool }],
        }),
      }),
      stop: async (): Promise<void> => {
        stopped = true;
      },
    }));

    const result = await operateRawTool(
      testDir,
      "fixture_write",
      { value: "saved" },
      { confirm: true },
    );

    expect(result.success).toBe(true);
    expect(confirmedInput).toEqual({
      value: "saved",
      confirmed: true,
      confirmationToken: "generated-token",
    });
    expect(stopped).toBe(true);
  });

  it("rejects raw-tool flags when an external runner is present", async () => {
    const monorepoDir = mkdtempSync(join(tmpdir(), "brain-tool-runner-"));
    try {
      writeFileSync(join(monorepoDir, "bun.lock"), "");
      mkdirSync(join(monorepoDir, "shell", "app", "src"), { recursive: true });
      writeFileSync(join(monorepoDir, "shell", "app", "src", "runner.ts"), "");
      writeFileSync(join(monorepoDir, "brain.yaml"), "brain: brain\n");

      const tool = commands.find((command) => command.name === "tool");
      if (!tool) throw new Error("tool command is not registered");

      const result = await tool.run(
        { args: ["system_status"], flags: { yes: true } },
        monorepoDir,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain("external runner");
    } finally {
      rmSync(monorepoDir, { recursive: true, force: true });
    }
  });

  it("fails gracefully without a runner or definition", async () => {
    const result = await operate(testDir, "status", [], {});
    expect(result.success).toBe(false);
    expect(result.message).toContain("Could not find brain runner");
  });
});
