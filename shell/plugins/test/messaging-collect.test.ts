import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell } from "../src/test/mock-shell";
import { createServicePluginContext } from "../src/service/context";

// The worker process takes no ordinary subscriptions and never runs the
// ready phase, so a build there asks its contributors at build time instead
// of waiting for them to announce themselves.
describe("messaging.collect", () => {
  it("gathers one answer per execution subscriber in a worker process", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const builder = createServicePluginContext(shell, "site-builder", {
      executionOnly: true,
    });
    const analytics = createServicePluginContext(shell, "analytics", {
      executionOnly: true,
    });
    const theme = createServicePluginContext(shell, "theme", {
      executionOnly: true,
    });
    analytics.messaging.subscribeExecution("test:contributions", async () => ({
      success: true,
      data: "beacon",
    }));
    theme.messaging.subscribeExecution("test:contributions", async () => ({
      success: true,
      data: "fonts",
    }));

    const answers = await builder.messaging.collect<unknown, string>({
      type: "test:contributions",
      payload: {},
    });

    expect(
      answers.flatMap((answer) => ("data" in answer ? [answer.data] : [])),
    ).toEqual(["beacon", "fonts"]);
  });

  it("answers with nothing when no plugin contributes", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const builder = createServicePluginContext(shell, "site-builder", {
      executionOnly: true,
    });

    expect(
      await builder.messaging.collect({ type: "test:nobody", payload: {} }),
    ).toEqual([]);
  });
});
