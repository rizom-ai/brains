import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  dashboardWidgetRegisterContract,
  dashboardWidgetUnregisterContract,
} from "../src/contracts/dashboard-widget-contracts";
import type { DashboardWidgetRegistration } from "../src/base/dashboard-namespace";
import { createPluginHarness } from "../src/test/harness";
import { SYSTEM_CHANNELS } from "../src/system-channels";
import {
  defineDashboardWidget,
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
} from "../src";

type Harness = ReturnType<typeof createPluginHarness>;

function isRegistration(value: unknown): value is DashboardWidgetRegistration {
  return (
    typeof value === "object" &&
    value !== null &&
    "dataProvider" in value &&
    typeof value.dataProvider === "function"
  );
}

const note = defineEntity({
  type: "note",
  purpose: "A note the dashboard counts.",
  metadata: z.object({ title: z.string() }),
});

const noteWidget = defineDashboardWidget({
  id: "note-count",
  title: "Notes",
  group: "knowledge",
  placement: "secondary",
  permission: "trusted",
  data: z.object({ notes: z.number().int().nonnegative() }),
  digest: ({ data }) => ({
    items: [{ label: "Notes", value: String(data.notes) }],
  }),
  view: ({ data }) => ({
    blocks: [{ type: "stats", items: [{ label: "Notes", value: data.notes }] }],
  }),
});

const counter = defineEntity({
  type: "note-counter",
  purpose: "Counts notes on the dashboard.",
  metadata: z.object({}),
  dashboardWidgets: (context) => [
    noteWidget.bind(context, async ({ entities, signal }) => {
      signal.throwIfAborted();
      return { notes: (await entities.list(note)).length };
    }),
  ],
});

async function install(entities: readonly AnyEntityDefinition[]): Promise<{
  harness: Harness;
  registered: DashboardWidgetRegistration[];
  unregistered: unknown[];
}> {
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "notes", entities }),
    {},
    { name: "@fixture/notes", version: "0.1.0" },
  );
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-dashboard"),
  });
  const registered: DashboardWidgetRegistration[] = [];
  const unregistered: unknown[] = [];
  const bus = harness.getMockShell().getMessageBus();
  bus.subscribe(dashboardWidgetRegisterContract.name, async (message) => {
    if (isRegistration(message.payload)) registered.push(message.payload);
    return { success: true };
  });
  bus.subscribe(dashboardWidgetUnregisterContract.name, async (message) => {
    unregistered.push(message.payload);
    return { success: true };
  });
  for (const plugin of plugins) await harness.installPlugin(plugin);
  await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
  for (const [id, visibility] of [
    ["open", "public"],
    ["private", "restricted"],
  ] as const) {
    await harness.getEntityService().createEntity({
      entity: {
        id,
        entityType: "note",
        content: "",
        metadata: { title: id },
        visibility,
      },
    });
  }
  return { harness, registered, unregistered };
}

describe("declared dashboard widgets", () => {
  it("registers each bound widget once plugins are registered", async () => {
    const { harness, registered } = await install([note, counter]);
    try {
      expect(
        registered.map(({ id, title, section, visibility }) => ({
          id,
          title,
          section,
          visibility,
        })),
      ).toEqual([
        {
          id: "note-count",
          title: "Notes",
          section: "secondary",
          visibility: "trusted",
        },
      ]);
    } finally {
      await harness.reset();
    }
  });

  it("loads at the caller's visibility", async () => {
    const { harness, registered } = await install([note, counter]);
    try {
      const [widget] = registered;
      if (!widget) throw new Error("No widget registered");
      const load = (
        permission: "admin" | "trusted",
      ): ReturnType<DashboardWidgetRegistration["dataProvider"]> =>
        widget.dataProvider({
          caller: { actor: { id: "operator" }, permission, isAnchor: false },
          signal: new AbortController().signal,
        });
      expect(await load("admin")).toMatchObject({
        digest: { items: [{ label: "Notes", value: "2" }] },
      });
      expect(await load("trusted")).toMatchObject({
        digest: { items: [{ label: "Notes", value: "1" }] },
      });
    } finally {
      await harness.reset();
    }
  });

  it("refuses a widget that was not bound by a definition", async () => {
    const outcome = await install([
      defineEntity({
        type: "fake-widget",
        purpose: "Returns a lookalike.",
        metadata: z.object({}),
        dashboardWidgets: () => [
          {
            kind: "rizom-dashboard-widget-binding",
            definition: { id: "lookalike" },
          },
        ],
      }),
    ]).catch((error: unknown) => error);
    expect(String(outcome)).toContain(
      'dashboard widget "lookalike" is not bound',
    );
  });

  it("unregisters its widgets on shutdown", async () => {
    const { harness, unregistered } = await install([note, counter]);
    await harness.reset();
    expect(unregistered).toContainEqual(
      expect.objectContaining({ widgetId: "note-count" }),
    );
  });
});
