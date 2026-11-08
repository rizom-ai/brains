import { describe, expect, it, mock } from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineInterface,
  defineJob,
  defineRoute,
  defineServicePlugin,
  defineStudioWorkspace,
  defineTool,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  studioWorkspaceRegisterContract,
  type Plugin,
  type StudioWorkspaceRegistration,
  type ToolContext,
} from "../src";

// The caller writes the schema's input; the handler is handed its output.
const postpone = defineJob({
  name: "postpone",
  input: z.object({ days: z.string().transform((days) => Number(days)) }),
  output: z.object({ seen: z.number() }),
});
const jobReference = z.object({ jobId: z.string() });

const queueFromStudio = defineWorkspaceAction({
  name: "queue",
  label: "Queue",
  permission: "trusted",
  input: z.object({ days: z.string() }),
  output: jobReference,
});
const planner = defineStudioWorkspace({
  id: "planner",
  label: "Planner",
  permission: "trusted",
  data: z.object({}),
  actions: [queueFromStudio],
  view: () => ({ blocks: [] }),
});

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

function install(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  name: string,
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name,
      version: "0.1.0",
    },
  );
  if (!plugin) throw new Error(`No plugin for ${name}`);
  return plugin;
}

/** Runs a queued job as the worker does: its data parsed at the boundary. */
async function handled(shell: MockShell, jobId: string): Promise<unknown> {
  const queue = shell.getJobQueueService();
  const job = await queue.getStatus(jobId);
  const handler = job && queue.getHandler(job.type);
  if (!job || !handler) throw new Error(`No job ${jobId}`);
  const data = handler.validateAndParse(JSON.parse(job.data));
  if (data === null) throw new Error("The worker refused the queued data");
  return handler.process(
    data,
    job.id,
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

describe("a job's input", () => {
  it("is parsed once, when it runs, wherever it was queued from", async () => {
    const shell = createMockShell({
      resolvePrincipal: mock(async (): Promise<CallerPrincipal | null> => ({
        userId: "usr_admin",
        permissionLevel: "admin",
      })),
    });
    const registrations: StudioWorkspaceRegistration[] = [];
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration>(
        studioWorkspaceRegisterContract.name,
        (message) => {
          registrations.push(message.payload);
          return { success: true, data: { workspaceUrl: "/studio/planner" } };
        },
      );
    const service = install(
      defineServicePlugin(
        { id: "planner", config: z.object({}) },
        {
          jobs: () => [
            postpone.handle(async ({ input }) => ({ seen: input.days })),
          ],
          tools: ({ jobs }) => [
            defineTool({
              name: "queue",
              description: "Queue a postponement",
              input: z.object({ days: z.string() }),
              output: jobReference,
              execute: async ({ input }) => ({
                jobId: (await jobs.enqueue(postpone, input)).id,
              }),
            }),
          ],
          studioWorkspaces: (context) => [
            planner.bind(context, {
              load: () => ({}),
              actions: [
                queueFromStudio.bind(context, async ({ input, jobs }) => ({
                  jobId: (await jobs.enqueue(postpone, input)).id,
                })),
              ],
            }),
          ],
        },
      ),
      "@fixture/planner",
    );
    const capabilities = await service.register(shell);
    await service.finalizeRegistration?.();
    const webhook = install(
      defineInterface(
        { id: "planner-webhook", config: z.object({}) },
        {
          routes: ({ jobs }) => [
            defineRoute({
              method: "POST",
              path: "/postpone",
              security: { kind: "public" },
              body: z.object({ days: z.string() }),
              response: jobReference,
              handle: async ({ body }) => ({
                jobId: (await jobs.enqueue(postpone, body)).id,
              }),
            }),
          ],
        },
      ),
      "@fixture/planner-webhook",
    );
    await webhook.register(shell);

    const tool = capabilities.tools[0];
    const route = webhook.getWebRoutes?.()[0];
    const action = registrations[0]?.actionHandler;
    if (!tool || !route || !action) throw new Error("Nothing queues the job");
    const fromTool = z
      .object({ data: jobReference })
      .parse(await tool.handler({ days: "7" }, admin)).data.jobId;
    const fromRoute = jobReference.parse(
      await (
        await route.handler(
          new Request("http://brain/postpone", {
            method: "POST",
            body: JSON.stringify({ days: "7" }),
          }),
        )
      ).json(),
    ).jobId;
    const fromStudio = jobReference.parse(
      await action(
        { actionId: "queue", input: { days: "7" } },
        {
          interfaceType: "studio",
          userId: "usr_admin",
          actor: { kind: "user", userId: "usr_admin" },
          userPermissionLevel: "admin",
          visibilityScope: "restricted",
          isAnchor: true,
        },
      ),
    ).jobId;

    for (const jobId of [fromTool, fromRoute, fromStudio]) {
      expect(await handled(shell, jobId)).toEqual({ seen: 7 });
    }
  });
});
