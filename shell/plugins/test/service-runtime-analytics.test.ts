import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import { type AnalyticsReportDefinition } from "../src";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class registers a report the
 * system_analytics tool answers, as its class did through
 * context.analytics.register: in the main process, and nowhere in a job
 * worker, which answers no tool. Analytics registers its traffic reports
 * this way.
 */

const overview: AnalyticsReportDefinition = {
  type: "traffic-overview",
  description: "The site's traffic over a window",
  params: z.object({}),
  handler: async () => ({ pageviews: 1 }),
};

describe("a first-party service's analytics reports", () => {
  it("registers a report the analytics tool answers, as its class did", async () => {
    const shell = createMockShell();
    const { runtime } = await probeService(shell);

    runtime.analyticsReport(overview);

    expect(
      shell
        .getAnalyticsRegistry()
        .getDefinitions()
        .map(({ type }) => type),
    ).toEqual(["traffic-overview"]);
  });

  it("reads with the read-only entity service a report is handed", async () => {
    const shell = createMockShell();
    const { runtime } = await probeService(shell);
    const service = shell.getEntityService();

    // A report's own reads, as the analytics tool hands it the service.
    expect(runtime.reportEntityService.getEntityTypes()).toEqual(
      service.getEntityTypes(),
    );
    expect(
      await runtime.reportEntityService.listEntities({ entityType: "note" }),
    ).toEqual(await service.listEntities({ entityType: "note" }));
    // Read-only: it writes nothing.
    expect(Object.keys(runtime.reportEntityService)).not.toContain(
      "createEntity",
    );
  });

  it("registers none in a job worker", async () => {
    const shell = createMockShell();
    const { runtime } = await probeService(shell, { executionOnly: true });

    runtime.analyticsReport(overview);

    expect(shell.getAnalyticsRegistry().getDefinitions()).toEqual([]);
  });
});
