import {
  createMockServicePluginContext,
  type MockServicePluginContext,
} from "@brains/plugins/test";
import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";
import { SiteContentOperations } from "../../src/lib/site-content-operations";
import type { MessageResponse, MessageSendRequest } from "@brains/plugins";
import type { RouteDefinitionInput } from "@brains/plugins";

const testRoutes: RouteDefinitionInput[] = [
  {
    id: "landing",
    path: "/",
    title: "Home",
    description: "Landing page",
    layout: "default",
    sections: [
      { id: "hero", template: "site-builder:hero" },
      { id: "features", template: "site-builder:features" },
    ],
    pluginId: "site-builder",
  },
  {
    id: "about",
    path: "/about",
    title: "About",
    description: "About us page",
    layout: "default",
    sections: [{ id: "main", template: "site-builder:content" }],
    pluginId: "site-builder",
  },
  {
    id: "dashboard",
    path: "/dashboard",
    title: "System Dashboard",
    description: "Monitor the system",
    layout: "default",
    sections: [{ id: "main", template: "site-builder:dashboard" }],
    pluginId: "site-builder",
  },
];

function createRoutesMessaging(
  routes: unknown[],
): (request: MessageSendRequest) => Promise<MessageResponse> {
  return async (request: MessageSendRequest) => {
    if (request.type === "site-builder:routes:list") {
      return { success: true, data: routes };
    }
    return { noop: true };
  };
}

function mockSuccessfulGeneration(
  context: MockServicePluginContext,
  batchId = "batch-123",
): void {
  spyOn(context.content, "generate").mockImplementation(
    mock(async (request) => {
      const dryRun = request.dryRun ?? false;
      return {
        items: request.targets.map((target, index) => {
          const base = {
            destination: {
              ...target.destination,
              idPath: [...target.destination.idPath] satisfies [
                string,
                ...string[],
              ],
              entityId: `stored-${index}`,
            },
            templateName: target.templateName,
          };
          return dryRun
            ? { ...base, status: "planned" as const }
            : {
                ...base,
                status: "queued" as const,
                jobId: `${batchId}-${index}`,
              };
        }),
        totalTargets: request.targets.length,
        plannedTargets: request.targets.length,
        queuedTargets: dryRun ? 0 : request.targets.length,
        skippedTargets: 0,
        ...(!dryRun && request.targets.length > 0 && { batchId }),
      };
    }),
  );
}

describe("SiteContentOperations", () => {
  let context: MockServicePluginContext;
  let operations: SiteContentOperations;

  beforeEach(() => {
    context = createMockServicePluginContext({
      returns: { messagingSend: createRoutesMessaging(testRoutes) },
    });
    operations = new SiteContentOperations(context);
    mockSuccessfulGeneration(context);
  });

  test("maps all route sections to structured generation targets", async () => {
    const result = await operations.generate({});

    expect(context.content.generate).toHaveBeenCalledTimes(1);
    const request = context.content.generate.mock.calls[0]?.[0];
    expect(request?.targets).toHaveLength(4);
    expect(request?.targets[0]).toEqual({
      templateName: "site-builder:hero",
      context: {
        data: {
          routeId: "landing",
          sectionId: "hero",
          routeTitle: "Home",
          routeDescription: "Landing page",
        },
      },
      destination: {
        entityType: "site-content",
        idPath: ["landing", "hero"],
        metadata: { routeId: "landing", sectionId: "hero" },
      },
    });
    expect(result).toEqual({
      jobs: [
        { jobId: "batch-123-0", routeId: "landing", sectionId: "hero" },
        {
          jobId: "batch-123-1",
          routeId: "landing",
          sectionId: "features",
        },
        { jobId: "batch-123-2", routeId: "about", sectionId: "main" },
        { jobId: "batch-123-3", routeId: "dashboard", sectionId: "main" },
      ],
      totalSections: 4,
      queuedSections: 4,
      batchId: "batch-123",
    });
  });

  test("passes the tool context through so the runtime owns caller attribution", async () => {
    const toolContext = {
      interfaceType: "mcp",
      actor: { kind: "external", externalActorId: "ext_test" } as const,
      userPermissionLevel: "trusted" as const,
    };

    await operations.generate({ routeId: "about" }, toolContext);

    expect(context.content.generate.mock.calls[0]?.[0].toolContext).toBe(
      toolContext,
    );
  });

  test("filters by route", async () => {
    const result = await operations.generate({ routeId: "landing" });
    const targets = context.content.generate.mock.calls[0]?.[0].targets;

    expect(targets?.map((target) => target.destination.idPath)).toEqual([
      ["landing", "hero"],
      ["landing", "features"],
    ]);
    expect(result.totalSections).toBe(2);
  });

  test("filters by section within a route", async () => {
    const result = await operations.generate({
      routeId: "landing",
      sectionId: "hero",
    });
    const targets = context.content.generate.mock.calls[0]?.[0].targets;

    expect(targets?.map((target) => target.destination.idPath)).toEqual([
      ["landing", "hero"],
    ]);
    expect(result.jobs).toEqual([
      { jobId: "batch-123-0", routeId: "landing", sectionId: "hero" },
    ]);
  });

  test("passes force to generic generation", async () => {
    await operations.generate({ routeId: "landing", force: true });

    expect(context.content.generate.mock.calls[0]?.[0].force).toBe(true);
  });

  test("uses exact generic planning counts for dry runs", async () => {
    context.content.generate.mockResolvedValueOnce({
      items: [],
      totalTargets: 4,
      plannedTargets: 3,
      queuedTargets: 0,
      skippedTargets: 1,
    });

    const result = await operations.generate({ dryRun: true });

    expect(context.content.generate.mock.calls[0]?.[0].dryRun).toBe(true);
    expect(result).toMatchObject({
      jobs: [],
      totalSections: 3,
      queuedSections: 0,
      batchId: "",
    });
  });

  test("returns no invented batch reference when nothing is eligible", async () => {
    context.content.generate.mockResolvedValueOnce({
      items: [],
      totalTargets: 4,
      plannedTargets: 0,
      queuedTargets: 0,
      skippedTargets: 4,
    });

    expect(await operations.generate({})).toEqual({
      jobs: [],
      totalSections: 0,
      queuedSections: 0,
      batchId: "",
    });
  });

  test("skips static and untemplated sections before generation", async () => {
    context = createMockServicePluginContext({
      returns: {
        messagingSend: createRoutesMessaging([
          {
            id: "mixed",
            path: "/mixed",
            layout: "default",
            sections: [
              {
                id: "static",
                template: "site-builder:content",
                content: "Static copy",
              },
              { id: "untemplated" },
              { id: "dynamic", template: "site-builder:content" },
            ],
            pluginId: "site-builder",
          },
        ]),
      },
    });
    operations = new SiteContentOperations(context);
    mockSuccessfulGeneration(context);

    await operations.generate({});

    expect(context.content.generate.mock.calls[0]?.[0].targets).toHaveLength(1);
    expect(
      context.content.generate.mock.calls[0]?.[0].targets[0]?.destination
        .idPath,
    ).toEqual(["mixed", "dynamic"]);
  });

  test("throws when the selected route does not exist", async () => {
    expect(operations.generate({ routeId: "missing" })).rejects.toThrow(
      "Route not found: missing",
    );
  });

  test("throws when site-builder route discovery is unavailable", async () => {
    context = createMockServicePluginContext({
      returns: { messagingSend: async () => ({ noop: true }) },
    });
    operations = new SiteContentOperations(context);

    expect(operations.generate({})).rejects.toThrow(
      "No handler for site-builder:routes:list",
    );
  });
});
