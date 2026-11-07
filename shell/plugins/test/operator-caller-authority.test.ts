import { describe, expect, it, spyOn } from "bun:test";
import { toSdkError, type ActorRef } from "@brains/contracts";
import type { ContentVisibility } from "@brains/entity-service";
import type { CallerPrincipal } from "@brains/content-service";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  dashboardWidgetRegisterContract,
  defineDashboardWidget,
  defineEntity,
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  studioWorkspaceRegisterContract,
  type DashboardWidgetRegistration,
  type EntityReader,
  type OwnedEntityWriter,
  type Plugin,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../src";

const memo = defineEntity({
  type: "memo",
  purpose: "A note at one visibility",
  metadata: z.object({ topic: z.enum(["plans", "people"]) }),
});
const stranger = defineEntity({
  type: "stranger",
  purpose: "A type the operator package does not own",
  metadata: z.object({}),
});

const visibilities: ContentVisibility[] = ["public", "shared", "restricted"];

type MemoAccess = EntityReader & OwnedEntityWriter<typeof memo>;

/** What one way of reaching entities saw and did inside a callback. */
const outcome = z.object({
  ids: z.array(z.string()),
  count: z.number(),
  wrote: z.string(),
});
const probeResult = z.object({ callback: outcome, captured: outcome });

const probe = defineWorkspaceAction({
  name: "probe",
  label: "Probe",
  permission: "trusted",
  input: z.object({ id: z.string() }),
  output: probeResult,
});
const memos = defineStudioWorkspace({
  id: "memos",
  label: "Memos",
  permission: "trusted",
  data: z.object({ callback: z.number(), captured: z.number() }),
  actions: [probe],
  view: () => ({ blocks: [] }),
});
const memoWidget = defineDashboardWidget({
  id: "memos",
  title: "Memos",
  group: "knowledge",
  placement: "secondary",
  permission: "public",
  data: z.object({ callback: z.number(), captured: z.number() }),
  view: () => ({ blocks: [] }),
});

/** Reads and writes through one `entities`, reporting a refusal by its code. */
async function exercise(
  entities: MemoAccess,
  id: string,
): Promise<z.output<typeof outcome>> {
  const listed = await entities.list(memo);
  const wrote = await entities
    .create(memo, { id, content: "Plan", metadata: { topic: "plans" } })
    .then(
      () => "created",
      (error: unknown) => toSdkError(error).code,
    );
  return {
    ids: listed.map((record) => record.id).sort(),
    count: await entities.count(memo),
    wrote,
  };
}

interface Installed {
  readonly shell: MockShell;
  readonly plugin: Plugin;
  readonly workspace: StudioWorkspaceRegistration;
  readonly widget: DashboardWidgetRegistration;
  /** The tools slot's `entities`, captured as a package could capture it. */
  readonly captured: MemoAccess;
  readonly loaded: { callback: number; captured: number }[];
}

/** The accounts Studio and the Dashboard sign these callers in as. */
const accounts: Record<string, UserPermissionLevel> = {
  usr_trusted: "trusted",
  usr_admin: "admin",
  usr_viewer: "admin",
};

async function install(): Promise<Installed> {
  const shell = createMockShell({
    resolvePrincipal: async (actor): Promise<CallerPrincipal | null> => {
      const level = actor.kind === "user" ? accounts[actor.userId] : undefined;
      return actor.kind === "user" && level
        ? { userId: actor.userId, permissionLevel: level }
        : null;
    },
  });
  // Creating a memo needs admin; a trusted operator may only read.
  shell.getPermissionService = (): PermissionService =>
    new PermissionService({ entityActions: { memo: { create: "admin" } } });
  const workspaces: StudioWorkspaceRegistration[] = [];
  const widgets: DashboardWidgetRegistration[] = [];
  const bus = shell.getMessageBus();
  bus.subscribe<StudioWorkspaceRegistration>(
    studioWorkspaceRegisterContract.name,
    (message) => {
      workspaces.push(message.payload);
      return { success: true, data: { workspaceUrl: "/studio/memos" } };
    },
  );
  bus.subscribe<DashboardWidgetRegistration>(
    dashboardWidgetRegisterContract.name,
    (message) => {
      widgets.push(message.payload);
      return { success: true };
    },
  );
  let captured: MemoAccess | undefined;
  const loaded: { callback: number; captured: number }[] = [];
  const definition = defineServicePlugin(
    { id: "memo-desk", config: z.object({}), entities: [memo] },
    {
      tools: ({ entities }) => {
        captured = entities;
        return [];
      },
      studioWorkspaces: (context) => [
        memos.bind(context, {
          async load({ entities }) {
            if (!captured) throw new Error("Nothing was captured");
            const counts = {
              callback: await entities.count(memo),
              captured: await captured.count(memo),
            };
            loaded.push(counts);
            return counts;
          },
          actions: [
            probe.bind(context, async ({ entities, input }) => {
              if (!captured) throw new Error("Nothing was captured");
              return {
                callback: await exercise(entities, `${input.id}-callback`),
                captured: await exercise(captured, `${input.id}-captured`),
              };
            }),
          ],
        }),
      ],
      dashboardWidgets: (context) => [
        memoWidget.bind(context, async ({ entities }) => {
          if (!captured) throw new Error("Nothing was captured");
          const counts = {
            callback: await entities.count(memo),
            captured: await captured.count(memo),
          };
          loaded.push(counts);
          return counts;
        }),
      ],
    },
  );
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/memo-desk", version: "0.1.0" },
  );
  const registered = await plugins.reduce<Promise<Plugin[]>>(
    async (done, plugin) => {
      await plugin.register(shell);
      return [...(await done), plugin];
    },
    Promise.resolve([]),
  );
  const plugin = registered.find((candidate) => candidate.type === "service");
  if (!plugin) throw new Error("No service plugin");
  await plugin.finalizeRegistration?.();
  await Promise.all(
    visibilities.map((visibility) =>
      shell.getEntityService().createEntity({
        entity: {
          id: `${visibility}-memo`,
          entityType: memo.type,
          content: `A ${visibility} memo`,
          metadata: { topic: "people" },
          visibility,
        },
      }),
    ),
  );
  const [workspace] = workspaces;
  const [widget] = widgets;
  if (!workspace || !widget || !captured) {
    throw new Error("The memo desk did not register");
  }
  return { shell, plugin, workspace, widget, captured, loaded };
}

function operator(
  permission: "trusted" | "admin",
  actor: ActorRef = { kind: "user", userId: `usr_${permission}` },
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: `usr_${permission}`,
    actor,
    userPermissionLevel: permission,
    visibilityScope: permission === "admin" ? "restricted" : "shared",
    isAnchor: false,
  };
}

async function runProbe(
  installed: Installed,
  actor: StudioWorkspaceActor,
  id: string,
): Promise<z.output<typeof probeResult>> {
  const handler = installed.workspace.actionHandler;
  if (!handler) throw new Error("The memo desk declares no actions");
  return probeResult.parse(
    await handler({ actionId: "probe", input: { id } }, actor),
  );
}

describe("an operator surface acts as its caller", () => {
  it("reads and writes alike through its own entities and a captured slot's, as the operator and held to the policy", async () => {
    const installed = await install();

    const trusted = await runProbe(installed, operator("trusted"), "t");
    const sharedView = {
      ids: ["public-memo", "shared-memo"],
      count: 2,
      wrote: "permission_denied",
    };
    expect(trusted).toEqual({ callback: sharedView, captured: sharedView });

    const created = spyOn(installed.shell.getEntityService(), "createEntity");
    const anchor: ActorRef = {
      kind: "user",
      userId: "usr_admin",
      canonicalId: "person-anchor",
    };
    const admin = await runProbe(installed, operator("admin", anchor), "a");
    expect(admin.callback).toEqual({
      ids: ["public-memo", "restricted-memo", "shared-memo"],
      count: 4,
      wrote: "created",
    });
    expect(admin.captured).toEqual({
      ids: ["a-callback", "public-memo", "restricted-memo", "shared-memo"],
      count: 5,
      wrote: "created",
    });
    // Both writes are the operator's, attributed to them as Studio saw them.
    expect(
      created.mock.calls.map(([request]) => request.options?.eventContext),
    ).toEqual([
      { actor: anchor, interfaceType: "studio" },
      { actor: anchor, interfaceType: "studio" },
    ]);

    // Outside any call the captured `entities` is the package again.
    expect(await installed.captured.count(memo)).toBe(5);
    await installed.plugin.shutdown?.();
  });

  it("loads a workspace and a widget at the caller's visibility, whichever entities it reads with", async () => {
    const installed = await install();

    await installed.workspace.dataProvider(operator("trusted"), {});
    await installed.widget.dataProvider({
      caller: {
        actor: { id: "usr_viewer" },
        permission: "admin",
        isAnchor: false,
      },
      signal: new AbortController().signal,
    });
    await installed.widget.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });

    expect(installed.loaded).toEqual([
      { callback: 2, captured: 2 },
      { callback: 3, captured: 3 },
      { callback: 1, captured: 1 },
    ]);
    await installed.plugin.shutdown?.();
  });

  it("offers a workspace action writes to the package's own types alone, and a loader none", () => {
    defineServicePlugin(
      { id: "memo-desk", config: z.object({}), entities: [memo] },
      {
        studioWorkspaces: (context) => [
          memos.bind(context, {
            async load({ entities }) {
              // @ts-expect-error A loader reads; it writes nothing.
              await entities.create(memo, {
                content: "x",
                metadata: { topic: "plans" },
              });
              return { callback: 0, captured: 0 };
            },
            actions: [
              probe.bind(context, async ({ entities }) => {
                await entities.create(memo, {
                  content: "x",
                  // Inline metadata keeps its literal type.
                  metadata: { topic: "people" },
                });
                // @ts-expect-error Only the header's own types are written.
                await entities.create(stranger, { content: "x", metadata: {} });
                await entities.create(memo, {
                  content: "x",
                  // @ts-expect-error The schema refuses this topic.
                  metadata: { topic: "gossip" },
                });
                return {
                  callback: { ids: [], count: 0, wrote: "" },
                  captured: { ids: [], count: 0, wrote: "" },
                };
              }),
            ],
          }),
        ],
      },
    );
    defineServicePlugin(
      { id: "no-types", config: z.object({}) },
      {
        studioWorkspaces: (context) => [
          memos.bind(context, {
            load: () => ({ callback: 0, captured: 0 }),
            actions: [
              probe.bind(context, async ({ entities }) => {
                // @ts-expect-error A package that owns no types writes none.
                await entities.create(memo, {
                  content: "x",
                  metadata: { topic: "plans" },
                });
                return {
                  callback: { ids: [], count: 0, wrote: "" },
                  captured: { ids: [], count: 0, wrote: "" },
                };
              }),
            ],
          }),
        ],
      },
    );
    expect(memos.kind).toBe("rizom-studio-workspace");
  });
});
