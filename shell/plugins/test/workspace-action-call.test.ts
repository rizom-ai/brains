import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  studioWorkspaceRegisterContract,
  type Plugin,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../src";

type ServicePackage = Parameters<typeof instantiatePluginPackageDefinition>[0];

interface InstalledWorkspace {
  readonly shell: MockShell;
  readonly plugin: Plugin;
  readonly registration: StudioWorkspaceRegistration;
}

/** Installs a package and returns the one Studio workspace it registers. */
async function installWorkspace(
  definition: ServicePackage,
  shell: MockShell = createMockShell({
    logger: createSilentLogger("workspace-action-call"),
  }),
): Promise<InstalledWorkspace> {
  const registrations: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      studioWorkspaceRegisterContract.name,
      (message) => {
        registrations.push(message.payload);
        return { success: true, data: { workspaceUrl: "/studio/reading" } };
      },
    );
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reading-operator", version: "0.1.0" },
  );
  if (!plugin) throw new Error("No plugin was created");
  await plugin.register(shell);
  await plugin.finalizeRegistration?.();
  const [registration] = registrations;
  if (!registration) throw new Error("No workspace was registered");
  return { shell, plugin, registration };
}

function operator(userId = "usr_operator"): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId,
    actor: { kind: "user", userId },
    userPermissionLevel: "trusted",
    visibilityScope: "shared",
    isAnchor: false,
  };
}

async function act(
  installed: InstalledWorkspace,
  request: object,
  signal?: AbortSignal,
): Promise<unknown> {
  const handler = installed.registration.actionHandler;
  if (!handler) throw new Error("The workspace declares no actions");
  return handler(request, operator(), signal);
}

function tokenOf(prepared: unknown): string {
  return z.object({ token: z.string() }).parse(prepared).token;
}

describe("a workspace action's input", () => {
  // The browser sends the schema's input; a callback is handed its output.
  const days = z.object({
    days: z.string().transform((value) => Number(value)),
  });
  const postpone = defineWorkspaceAction({
    name: "postpone",
    label: "Postpone",
    permission: "trusted",
    input: days,
    output: z.object({ days: z.number() }),
  });
  const reschedule = defineWorkspaceAction({
    name: "reschedule",
    label: "Reschedule",
    permission: "trusted",
    confirmation: { kind: "prepared" },
    input: days,
    output: z.object({ days: z.number() }),
  });
  const planner = defineStudioWorkspace({
    id: "planner",
    label: "Planner",
    permission: "trusted",
    data: z.object({}),
    actions: [postpone, reschedule],
    view: () => ({
      blocks: [
        {
          type: "actions",
          items: [
            { action: postpone, input: { days: "7" } },
            { action: reschedule, input: { days: "7" } },
          ],
        },
      ],
    }),
  });

  it("reaches the view as written and each callback once, parsed", async () => {
    const seen: unknown[] = [];
    const installed = await installWorkspace(
      defineServicePlugin(
        { id: "planner", config: z.object({}) },
        {
          studioWorkspaces: (context) => [
            planner.bind(context, {
              load: () => ({}),
              actions: [
                postpone.bind(context, ({ input }) => {
                  seen.push(input.days);
                  return { days: input.days };
                }),
                reschedule.bind(
                  context,
                  ({ input }) => {
                    seen.push(input.days);
                    return { days: input.days };
                  },
                  ({ input }) => {
                    seen.push(input.days);
                    return { summary: `Move by ${input.days}?`, revision: "1" };
                  },
                ),
              ],
            }),
          ],
        },
      ),
    );

    const loaded = await installed.registration.dataProvider(operator(), {});
    expect(loaded).toMatchObject({
      view: {
        blocks: [
          {
            type: "actions",
            items: [
              { actionId: "postpone", input: { days: "7" } },
              { actionId: "reschedule", input: { days: "7" } },
            ],
          },
        ],
      },
    });

    expect(
      await act(installed, { actionId: "postpone", input: { days: "7" } }),
    ).toEqual({ days: 7 });
    const token = tokenOf(
      await act(installed, {
        actionId: "reschedule",
        input: { days: "7" },
        mode: "prepare",
      }),
    );
    expect(
      await act(installed, {
        actionId: "reschedule",
        input: { days: "7" },
        confirmationToken: token,
      }),
    ).toEqual({ days: 7 });
    // postpone; prepare; prepare again on confirm, then execute.
    expect(seen).toEqual([7, 7, 7, 7]);
    await installed.plugin.shutdown?.();
  });

  it("answers with the cancellation when its request goes while it runs", async () => {
    // Each call's own request, which its callback ends mid-call.
    const executing = new AbortController();
    const preparing = new AbortController();
    const left = new Error("The operator left");
    const installed = await installWorkspace(
      defineServicePlugin(
        { id: "planner", config: z.object({}) },
        {
          studioWorkspaces: (context) => [
            planner.bind(context, {
              load: () => ({}),
              actions: [
                postpone.bind(context, ({ input }) => {
                  executing.abort(left);
                  return { days: input.days };
                }),
                reschedule.bind(
                  context,
                  ({ input }) => ({ days: input.days }),
                  () => {
                    preparing.abort(left);
                    return { summary: "Move?", revision: "1" };
                  },
                ),
              ],
            }),
          ],
        },
      ),
    );

    expect(
      act(
        installed,
        { actionId: "postpone", input: { days: "7" } },
        executing.signal,
      ),
    ).rejects.toBe(left);
    expect(
      act(
        installed,
        { actionId: "reschedule", input: { days: "7" }, mode: "prepare" },
        preparing.signal,
      ),
    ).rejects.toBe(left);
    await installed.plugin.shutdown?.();
  });
});
