import { describe, expect, it } from "bun:test";
import { createServicePluginContext, type Template } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { siteBuilderRoutesContract } from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import { createSiteContentPlugins } from "./site-content-plugins";

/**
 * Who a section's generation runs for, pinned as the site-content plugin
 * class queued it: the generate tool hands the content service its call's
 * context, so the job is the tool caller's, sourced to site-content, and
 * writes the section's site-content record.
 */

/** What a queued generation records, as the content service queues it. */
const jobDataSchema = z.object({
  templateName: z.string(),
  destination: z.object({ entityType: z.string(), entityId: z.string() }),
  authority: z.object({ actor: z.unknown() }),
});

const hero: Template = {
  name: "hero",
  description: "A hero section",
  requiredPermission: "public",
  schema: z.string(),
  basePrompt: "Write a hero",
  dataSourceId: "shell:ai-content",
  formatter: {
    format: (value) => z.string().parse(value),
    parse: (value) => value,
  },
};

describe("a section's generation", () => {
  it("is queued for the tool's caller, as the class queued it", async () => {
    const shell = createMockShell();
    shell.registerTemplates({ hero }, "site-builder");
    createServicePluginContext(shell, "site-builder").messaging.answer(
      siteBuilderRoutesContract,
      async () => [
        {
          id: "home",
          path: "/",
          title: "Home",
          description: "The home page",
          layout: "default",
          sections: [{ id: "hero", template: "site-builder:hero" }],
          pluginId: "site-builder",
        },
      ],
    );
    const tools = [];
    for (const plugin of createSiteContentPlugins()) {
      tools.push(...(await plugin.register(shell)).tools);
    }
    const tool = tools.find(({ name }) => name === "site-content_generate");
    if (!tool) throw new Error("No generate tool");
    const actor = { kind: "service" as const, serviceId: "operator" };

    const result = await tool.handler(
      { routeId: "home" },
      {
        interfaceType: "mcp",
        actor,
        userPermissionLevel: "admin",
        progressToken: "progress-1",
      },
    );

    const jobs = z
      .object({
        data: z.object({ jobs: z.array(z.object({ jobId: z.string() })) }),
      })
      .parse(result).data.jobs;
    expect(jobs).toHaveLength(1);
    const job = await shell
      .getJobQueueService()
      .getStatus(jobs[0]?.jobId ?? "");
    if (!job) throw new Error("No job queued");
    expect(job.source).toBe("site-content");
    expect(job.metadata.requestedByActor).toEqual(actor);
    expect(job.metadata.progressToken).toBe("progress-1");
    const data = jobDataSchema.parse(JSON.parse(job.data));
    expect(data.templateName).toBe("site-builder:hero");
    expect(data.destination).toMatchObject({
      entityType: "site-content",
      entityId: "home:hero",
    });
    expect(data.authority.actor).toEqual(actor);
  });
});
