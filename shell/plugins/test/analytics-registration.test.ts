import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { describe, it, expect, beforeEach } from "bun:test";
import { z } from "@brains/utils/zod";

import { createBasePluginContext } from "../src/base/context";
import { defineAnalyticsReport } from "../src";

function report(type: string): ReturnType<typeof defineAnalyticsReport> {
  return defineAnalyticsReport({
    type,
    description: `The ${type} report.`,
    params: z.object({ limit: z.number().int().default(5) }),
    handler: async ({ limit }, { visibilityScope }) => ({
      type,
      limit,
      visibilityScope,
    }),
  });
}

describe("analytics reports registered through the plugin context", () => {
  let shell: MockShell;

  beforeEach(() => {
    shell = createMockShell();
  });

  it("lists a plugin's report with its definition", () => {
    const context = createBasePluginContext(shell, "test-plugin");
    context.analytics.register(report("custom-report"));

    const types = shell
      .getAnalyticsRegistry()
      .getDefinitions()
      .map((definition) => definition.type);
    expect(types).toContain("custom-report");
  });

  it("runs it with parsed params at the caller's scope", async () => {
    const context = createBasePluginContext(shell, "test-plugin");
    context.analytics.register(report("custom-report"));

    const result = await shell.getAnalyticsRegistry().run({
      type: "custom-report",
      params: { limit: 3 },
      entityService: shell.getEntityService(),
      permission: "trusted",
    });
    expect(result).toEqual({
      type: "custom-report",
      limit: 3,
      visibilityScope: "shared",
    });
  });

  it("keeps every plugin's reports", () => {
    createBasePluginContext(shell, "plugin-a").analytics.register(
      report("report-a"),
    );
    createBasePluginContext(shell, "plugin-b").analytics.register(
      report("report-b"),
    );

    const types = shell
      .getAnalyticsRegistry()
      .getDefinitions()
      .map((definition) => definition.type);
    expect(types).toEqual(expect.arrayContaining(["report-a", "report-b"]));
  });
});
