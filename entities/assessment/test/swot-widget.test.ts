import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  type UserPermissionLevel,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSwotContent } from "../src";
import { createAssessmentPlugins } from "./assessment-plugins";

interface Registration {
  id: string;
  pluginId: string;
  dataProvider(input: {
    caller: {
      actor: { id: string };
      permission: UserPermissionLevel;
      isAnchor: boolean;
    } | null;
    signal: AbortSignal;
  }): Promise<unknown>;
}

function isRegistration(value: unknown): value is Registration {
  return (
    typeof value === "object" &&
    value !== null &&
    "dataProvider" in value &&
    typeof value.dataProvider === "function"
  );
}

const ready = { digest: { items: [{ label: "SWOT", value: "Ready" }] } };
const generating = {
  digest: { items: [{ label: "SWOT", value: "Generating" }] },
};

/**
 * The Dashboard's SWOT reads at the viewer's visibility, as declared
 * widgets do. The rule writes the SWOT public, so every viewer sees it, and
 * a public or anonymous viewer still sees only a public SWOT, as on main,
 * whose class read it public only: the public dashboard is unchanged.
 */
describe("the SWOT widget", () => {
  async function widgetOver(
    visibility: "public" | "shared" | "restricted",
  ): Promise<(permission: UserPermissionLevel | null) => Promise<unknown>> {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-swot-widget-${randomUUID()}`,
    });
    const registered: Registration[] = [];
    harness
      .getMockShell()
      .getMessageBus()
      .subscribe(dashboardWidgetRegisterContract.name, async (message) => {
        if (isRegistration(message.payload)) registered.push(message.payload);
        return { success: true };
      });
    for (const plugin of createAssessmentPlugins())
      await harness.installPlugin(plugin);
    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
    const derivedAt = "2026-05-01T00:00:00.000Z";
    await harness.getEntityService().createEntity({
      entity: {
        id: "swot",
        entityType: "swot",
        content: createSwotContent({
          strengths: [{ title: "Research edge" }],
          weaknesses: [],
          opportunities: [],
          threats: [],
          derivedAt,
        }),
        metadata: { derivedAt },
        visibility,
      },
    });
    const [widget] = registered;
    if (!widget) throw new Error("No widget registered");
    expect(widget).toMatchObject({ id: "swot", pluginId: "swot" });
    return (permission) =>
      widget.dataProvider({
        caller:
          permission === null
            ? null
            : { actor: { id: "viewer" }, permission, isAnchor: false },
        signal: new AbortController().signal,
      });
  }

  it("shows a public SWOT to every viewer", async () => {
    const load = await widgetOver("public");

    for (const permission of [null, "public", "trusted", "admin"] as const) {
      expect(await load(permission)).toMatchObject(ready);
    }
  });

  it("shows a public or anonymous viewer only a public SWOT", async () => {
    for (const visibility of ["shared", "restricted"] as const) {
      const load = await widgetOver(visibility);

      expect(await load(null)).toMatchObject(generating);
      expect(await load("public")).toMatchObject(generating);
      expect(await load("admin")).toMatchObject(ready);
    }
  });
});
