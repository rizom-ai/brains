import { describe, expect, it } from "bun:test";
import { SdkError } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  type PluginCapabilities,
  type ToolContext,
} from "../src";

const SECRET = "the private body of tide-1";

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "service", serviceId: "test" },
  userPermissionLevel: "admin",
};

const outcome = z.object({
  outcome: z.enum(["explained", "crash", "malformed", "ok"]),
});

async function install(): Promise<PluginCapabilities> {
  const definition = defineServicePlugin(
    { id: "outcomes", config: z.object({}) },
    {
      tools: () => [
        defineTool({
          name: "run",
          description: "Runs to an outcome",
          input: outcome,
          output: z.object({ ok: z.boolean() }),
          execute: ({ input }) => {
            if (input.outcome === "explained") {
              throw new SdkError("conflict", {
                message: SECRET,
                publicMessage: "Refresh the item and try again",
              });
            }
            if (input.outcome === "crash") throw new Error(SECRET);
            if (input.outcome === "malformed") {
              // An answer outside the output schema, untyped.
              return JSON.parse(`{"ok":"${SECRET}"}`);
            }
            return { ok: true };
          },
        }),
        defineTool({
          name: "close",
          description: "Closes an item after approval",
          input: z.object({ item: z.string().trim() }),
          output: z.object({ closed: z.string() }),
          confirmation: ({ item }) => `Close ${item}?`,
          execute: ({ input }) => ({ closed: input.item }),
        }),
      ],
    },
  );
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name: "@fixture/outcomes",
      version: "0.1.0",
    },
  );
  if (!plugin) throw new Error("No service plugin");
  return createPluginHarness({ logger: createSilentLogger() }).installPlugin(
    plugin,
  );
}

async function call(
  capabilities: PluginCapabilities,
  name: string,
  input: unknown,
  context: ToolContext = admin,
): Promise<unknown> {
  const tool = capabilities.tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`No tool ${name}`);
  return tool.handler(input, context);
}

describe("a service tool's failure is reported in its public form", () => {
  it("passes on an SdkError's public message and code", async () => {
    const tools = await install();
    const response = await call(tools, "outcomes_run", {
      outcome: "explained",
    });
    expect(response).toEqual({
      success: false,
      code: "conflict",
      error: "Refresh the item and try again",
    });
  });

  it("never passes on a plain error's message", async () => {
    const tools = await install();
    const response = await call(tools, "outcomes_run", { outcome: "crash" });
    expect(response).toEqual({
      success: false,
      code: "handler_failed",
      error: "The operation failed",
    });
    expect(JSON.stringify(response)).not.toContain(SECRET);
  });

  it("reports input the schema refuses, and an answer outside the output schema", async () => {
    const tools = await install();
    expect(
      await call(tools, "outcomes_run", { outcome: "someday" }),
    ).toMatchObject({ success: false, code: "invalid_input" });
    const malformed = await call(tools, "outcomes_run", {
      outcome: "malformed",
    });
    expect(malformed).toMatchObject({
      success: false,
      code: "invalid_response",
    });
    expect(JSON.stringify(malformed)).not.toContain(SECRET);
  });

  it("reports a call whose caller already gave up as cancelled", async () => {
    const tools = await install();
    const controller = new AbortController();
    controller.abort();
    expect(
      await call(
        tools,
        "outcomes_run",
        { outcome: "ok" },
        { ...admin, signal: controller.signal },
      ),
    ).toMatchObject({ success: false, code: "cancelled" });
  });
});

describe("a service tool's input refusal tells the caller what to fix", () => {
  it("names each offending path and why", async () => {
    const tools = await install();
    const response = await call(tools, "outcomes_run", { outcome: "someday" });
    expect(response).toMatchObject({ success: false, code: "invalid_input" });
    const { error } = z.object({ error: z.string() }).parse(response);
    expect(error).toStartWith("outcome: ");
    expect(error).toContain("explained");
  });

  it("stays within the public bound however many issues there are", async () => {
    const fields = Array.from({ length: 200 }, (_, index) => [
      `field${index}`,
      z.string(),
    ]);
    const definition = defineServicePlugin(
      { id: "wide", config: z.object({}) },
      {
        tools: () => [
          defineTool({
            name: "wide",
            description: "Takes many fields",
            input: z.object(Object.fromEntries(fields)),
            output: z.object({}),
            execute: () => ({}),
          }),
        ],
      },
    );

    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      {
        name: "@fixture/wide",
        version: "0.1.0",
      },
    );
    if (!plugin) throw new Error("No service plugin");
    const wide = await createPluginHarness({
      logger: createSilentLogger(),
    }).installPlugin(plugin);
    const { error } = z
      .object({ error: z.string() })
      .parse(await call(wide, "wide_wide", {}));
    expect(error.length).toBeLessThanOrEqual(1024);
    // Cut between whole issues, saying how many it left out.
    const match = /^(.*), … (\d+) more$/su.exec(error);
    expect(match).not.toBeNull();
    const dropped = Number(match?.[2]);
    expect(match?.[1]).toBe(
      fields
        .slice(0, fields.length - dropped)
        .map(
          ([name]) =>
            `${String(name)}: Invalid input: expected string, received undefined`,
        )
        .join(", "),
    );
  });
});

describe("a service tool's confirmation", () => {
  it("is written from the parsed input it asks to approve", async () => {
    const tools = await install();
    expect(
      await call(tools, "outcomes_close", { item: "  the tide card  " }),
    ).toMatchObject({
      needsConfirmation: true,
      summary: "Close the tide card?",
    });
  });
});
