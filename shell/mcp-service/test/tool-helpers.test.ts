import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createTool, toolSuccess } from "../src/tool-helpers";
import type { ToolContext } from "../src/types";

const toolContext: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test-user" },
  userPermissionLevel: "admin",
};

describe("createTool", () => {
  it("prefixes the tool name with the plugin id by default", () => {
    const tool = createTool(
      "playbooks",
      "status",
      "Get status",
      z.object({}),
      async () => toolSuccess({ ok: true }),
    );
    expect(tool.name).toBe("playbooks_status");
  });

  it("uses nameOverride verbatim when provided", () => {
    const tool = createTool(
      "playbooks",
      "status",
      "Get status",
      z.object({}),
      async () => toolSuccess({ ok: true }),
      { nameOverride: "playbook_status" },
    );
    expect(tool.name).toBe("playbook_status");
  });

  it("carries outputSchema through when provided", () => {
    const outputSchema = z.object({ ok: z.boolean() });
    const tool = createTool(
      "pipeline",
      "publish",
      "Publish",
      z.object({}),
      async () => toolSuccess({ ok: true }),
      { outputSchema },
    );
    expect(tool.outputSchema).toBe(outputSchema);
  });

  it("passes confirmation responses through untouched", async () => {
    const tool = createTool(
      "pipeline",
      "publish",
      "Publish",
      z.object({}),
      async () => ({
        needsConfirmation: true,
        toolName: "pipeline_publish",
        summary: "Publish?",
        args: {},
      }),
    );
    const result = await tool.handler({}, toolContext);
    expect("needsConfirmation" in result && result.needsConfirmation).toBe(
      true,
    );
  });

  it("rejects invalid input before the handler runs", async () => {
    let ran = false;
    const tool = createTool(
      "demo",
      "echo",
      "Echo",
      z.object({ value: z.string() }),
      async (input) => {
        ran = true;
        return toolSuccess({ value: input.value });
      },
    );
    const result = await tool.handler({ value: 42 }, toolContext);
    expect(ran).toBe(false);
    if (!("success" in result) || result.success !== false) {
      throw new Error("expected a failure response");
    }
    expect(result.error).toContain("Invalid input");
  });
});
