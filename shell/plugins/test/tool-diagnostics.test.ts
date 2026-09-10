import { expect, test } from "bun:test";
import { defineServicePlugin, defineTool } from "../src/index";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../test";
import { instantiatePluginPackageDefinition } from "../src/package-definition";

test("tool diagnostics never become response properties or cross response identities", async () => {
  const reason = Object.assign(new Error("the real reason"), {
    secret: "diagnostic-only-token",
  });
  const definition = defineServicePlugin(
    { id: "diagnostics", config: z.object({}) },
    {
      tools: () => [
        defineTool({
          name: "fail",
          description: "Throw a diagnostic",
          input: z.object({}),
          output: z.string(),
          execute: () => {
            throw reason;
          },
        }),
      ],
    },
  );
  const harness = createPluginHarness();
  try {
    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      {
        name: "@fixture/diagnostics",
        version: "0.0.0",
      },
    );
    const installed = await harness.installPlugins(plugins);
    const tool = installed[0]?.capabilities.tools[0];
    if (!tool) throw new Error("Missing tool");
    const context = {
      interfaceType: "test",
      actor: { kind: "service" as const, serviceId: "test" },
      userPermissionLevel: "admin" as const,
    };
    const response = await harness.callTool(tool, {}, context);
    expect(Reflect.ownKeys(response).sort()).toEqual([
      "code",
      "error",
      "success",
    ]);
    expect(JSON.stringify(response)).not.toContain("diagnostic-only-token");
    expect(harness.getToolFailureCause(response)).toBe(reason);
    expect(harness.getToolFailureCause({ ...response })).toBeUndefined();
    const refusal = await harness.callTool(
      tool,
      {},
      { ...context, userPermissionLevel: "public" },
    );
    expect(refusal).toMatchObject({
      success: false,
      code: "permission_denied",
    });
    expect(harness.getToolFailureCause(refusal)).toBeUndefined();
  } finally {
    await harness.reset();
  }
});
