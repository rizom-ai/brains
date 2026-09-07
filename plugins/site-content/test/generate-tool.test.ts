import { describe, expect, spyOn, test } from "bun:test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { SiteContentService } from "../src/lib/site-content-service";
import { createSiteContentTools } from "../src/tools";

describe("site generation tool admission messages", () => {
  test("uses the trusted tool signal before route discovery or enqueue", async () => {
    const context = createMockServicePluginContext();
    const service = new SiteContentService(context);
    const tool = createSiteContentTools(() => service, "site-content")[0];
    if (!tool) throw new Error("Missing generation tool");
    const result = await tool.handler(
      {},
      {
        interfaceType: "test",
        actor: { kind: "service", serviceId: "test" },
        userPermissionLevel: "admin",
        signal: AbortSignal.abort(new Error("cancelled tool")),
      },
    );
    expect(result).toMatchObject({ success: false });
    expect(context.messaging.send).not.toHaveBeenCalled();
    expect(context.content.generate).not.toHaveBeenCalled();
  });

  test.each([
    {
      dryRun: true,
      total: 3,
      queued: 0,
      batchId: "",
      message: "Planned 3 sections. No jobs were queued.",
    },
    {
      dryRun: false,
      total: 3,
      queued: 3,
      batchId: "batch-real",
      message: "Queued 3 of 3 sections. Jobs are running in the background.",
    },
    {
      dryRun: false,
      total: 0,
      queued: 0,
      batchId: "",
      message: "No new content to generate. No jobs were queued.",
    },
  ])(
    "reports $message",
    async ({ dryRun, total, queued, batchId, message }) => {
      const service = new SiteContentService(createMockServicePluginContext());
      spyOn(service, "generateContent").mockResolvedValue({
        totalSections: total,
        queuedSections: queued,
        batchId,
        jobs: [],
      });
      const tool = createSiteContentTools(() => service, "site-content")[0];
      if (!tool) throw new Error("Missing generation tool");
      const result = await tool.handler(
        { dryRun },
        {
          interfaceType: "test",
          actor: { kind: "service", serviceId: "test" },
          userPermissionLevel: "admin",
        },
      );
      expect(result).toMatchObject({
        success: true,
        message,
        data: {
          batchId,
          jobsQueued: queued,
          totalSections: total,
          jobs: [],
        },
      });
    },
  );
});
