import { describe, expect, spyOn, test } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { PermissionService } from "@brains/sdk/services";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { installSiteContent } from "./helpers/install";

const caller = {
  interfaceType: "test",
  actor: { kind: "service" as const, serviceId: "test" },
  userPermissionLevel: "admin" as const,
};

describe("site generation tool admission messages", () => {
  test("uses the trusted tool signal before route discovery or enqueue", async () => {
    const harness = createPluginHarness();
    try {
      const { capabilities } = await installSiteContent(harness);
      const send = spyOn(harness.getMockShell().getMessageBus(), "send");
      const generate = spyOn(
        harness.getMockShell().getContentService(),
        "submitGeneration",
      );
      const tool = capabilities.tools[0];
      if (!tool) throw new Error("Missing generation tool");
      const result = await tool.handler(
        {},
        { ...caller, signal: AbortSignal.abort() },
      );
      expect(result).toMatchObject({ success: false, code: "cancelled" });
      expect(send).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    } finally {
      await harness.reset();
    }
  });

  test.each([
    {
      dryRun: true,
      total: 3,
      queued: 0,
      message: "Planned 3 sections. No jobs were queued.",
    },
    {
      dryRun: false,
      total: 3,
      queued: 3,
      message: "Queued 3 of 3 sections. Jobs are running in the background.",
    },
    {
      dryRun: false,
      total: 0,
      queued: 0,
      message: "No new content to generate. No jobs were queued.",
    },
  ])(
    "reports $message using shared durable admission",
    async ({ dryRun, total, queued, message }) => {
      const harness = createPluginHarness();
      harness.setPermissionService(
        new PermissionService({ admins: ["service:test"] }),
      );
      try {
        const { capabilities } = await installSiteContent(harness);
        harness.getMockShell().registerTemplates(
          {
            hero: {
              name: "hero",
              description: "Hero",
              schema: z.string(),
              requiredPermission: "admin",
              basePrompt: "Write a heading",
              dataSourceId: "shell:ai-content",
              formatter: {
                format: (value: string): string => value,
                parse: (value: string): string => value,
              },
            },
          },
          "external-site",
        );
        harness.subscribe(SITE_BUILDER_CHANNELS.routesList, async () => ({
          success: true,
          data: [
            {
              id: "home",
              sections: Array.from({ length: total }, (_, i) => ({
                id: `hero-${i}`,
                template: "external-site:hero",
              })),
            },
          ],
        }));
        const tool = capabilities.tools[0];
        if (!tool) throw new Error("Missing generation tool");
        const result = await tool.handler({ dryRun }, caller);
        if (!("success" in result) || !result.success)
          throw harness.getToolFailureCause(result);
        expect(result).toMatchObject({
          success: true,
          data: { message, jobsQueued: queued, totalSections: total },
        });
        const jobs = await harness
          .getMockShell()
          .getJobQueueService()
          .getRecentJobs();
        expect(jobs).toHaveLength(queued);
        for (const job of jobs) {
          expect(job.type).toBe("shell:content-generation");
          expect(job.maxRetries).toBe(0);
          const payload = z
            .object({
              destination: z.object({ entityType: z.string() }),
              expectedRevision: z.null(),
            })
            .parse(JSON.parse(job.data));
          expect(payload.destination.entityType).toBe("site-content");
        }
      } finally {
        await harness.reset();
      }
    },
  );
});
