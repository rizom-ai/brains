import { describe, expect, it } from "bun:test";
import { createMockEntityService } from "@brains/entity-service/test";
import {
  contentGenerationJobDataSchema,
  type ContentGenerationItemResult,
  type ContentGenerationTargetInput,
} from "@brains/content-service";
import { PermissionService, type Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class registers the templates its
 * config defines under the namespace each names, and asks the content
 * service to generate them as its class asked: the targets as written,
 * with the tool call's caller, or the package's own grant without one.
 * Site-content generates each section of a site's routes this way.
 */

const hero: Template = {
  name: "hero",
  description: "A hero section",
  requiredPermission: "trusted",
  schema: z.string(),
  basePrompt: "Write a hero",
  dataSourceId: "shell:ai-content",
  formatter: {
    format: (value) => z.string().parse(value),
    parse: (value) => value,
  },
};

function brain(): MockShell {
  const shell = createMockShell({
    entityService: createMockEntityService({ entityTypes: ["site-content"] }),
  });
  const permissions = new PermissionService({
    trusted: ["service:site-content"],
  });
  shell.getPermissionService = (): PermissionService => permissions;
  return shell;
}

async function runtimeOn(shell: MockShell): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "site-content",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/site-content", version: "0.1.0" },
    { pluginId: "site-content" },
  );
  await plugin?.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return runtime;
}

const target: ContentGenerationTargetInput = {
  templateName: "landing-page:hero",
  context: { data: { routeId: "home", sectionId: "hero" } },
  destination: {
    entityType: "site-content",
    idPath: ["home", "hero"],
    metadata: {},
  },
};

const jobIdOf = (item: ContentGenerationItemResult | undefined): string =>
  item?.status === "queued" ? item.jobId : "";

describe("a first-party service's templates and content generation", () => {
  it("registers a template under the namespace it names, as its class did", async () => {
    const shell = brain();
    const runtime = await runtimeOn(shell);

    runtime.template("hero", hero, { namespace: "landing-page" });
    runtime.template("intro", { ...hero, name: "intro" });

    expect(shell.getTemplates().get("landing-page:hero")?.name).toBe("hero");
    // Without one, under the plugin's id, as before.
    expect(shell.getTemplates().get("site-content:intro")?.name).toBe("intro");
  });

  it("queues the targets with the tool call's caller, as its class did", async () => {
    const shell = brain();
    const runtime = await runtimeOn(shell);
    runtime.template("hero", hero, { namespace: "landing-page" });
    const toolContext = {
      interfaceType: "mcp",
      actor: { kind: "service" as const, serviceId: "site-content" },
      userPermissionLevel: "admin" as const,
      progressToken: "progress-1",
    };

    const result = await runtime.generateContent({
      targets: [target],
      toolContext,
      force: true,
    });

    expect(result.items.map(({ status }) => status)).toEqual(["queued"]);
    const job = await shell
      .getJobQueueService()
      .getStatus(jobIdOf(result.items[0]));
    expect(job?.source).toBe("site-content");
    expect(job?.metadata.requestedByActor).toEqual(toolContext.actor);
    expect(job?.metadata.progressToken).toBe("progress-1");
    const data = contentGenerationJobDataSchema.parse(
      JSON.parse(job?.data ?? "null"),
    );
    // A full template name is kept; the caller's level never exceeds the
    // package's configured grant.
    expect(data.templateName).toBe("landing-page:hero");
    expect(data.destination.entityId).toBe("home:hero");
    expect(data.authority.permissionCeiling).toBe("trusted");
  });

  it("queues as the package's own grant without a tool call, and plans a dry run", async () => {
    const shell = brain();
    const runtime = await runtimeOn(shell);
    runtime.template("hero", hero, { namespace: "landing-page" });

    const planned = await runtime.generateContent({
      targets: [target],
      dryRun: true,
    });
    expect(planned.items.map(({ status }) => status)).toEqual(["planned"]);
    expect(planned.batchId).toBeUndefined();

    const result = await runtime.generateContent({ targets: [target] });
    const job = await shell
      .getJobQueueService()
      .getStatus(jobIdOf(result.items[0]));
    if (!job) throw new Error("No job queued");
    // Nobody requested it: it runs as the package, at its own grant.
    expect(Object.keys(job.metadata)).not.toContain("requestedByActor");
    const data = contentGenerationJobDataSchema.parse(JSON.parse(job.data));
    expect(data.authority).toMatchObject({
      actor: { kind: "service", serviceId: "site-content" },
      permissionCeiling: "trusted",
    });
  });

  it("stops before it plans when the call is cancelled", async () => {
    const shell = brain();
    const runtime = await runtimeOn(shell);
    runtime.template("hero", hero, { namespace: "landing-page" });
    const reason = new Error("cancelled");

    expect(
      runtime.generateContent({
        targets: [target],
        signal: AbortSignal.abort(reason),
      }),
    ).rejects.toBe(reason);
  });
});
