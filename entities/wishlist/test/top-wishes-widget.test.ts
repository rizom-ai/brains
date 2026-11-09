import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  type UserPermissionLevel,
} from "@brains/plugins";
import { wishlistPlugin } from "./wishlist-plugin";

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

// The Dashboard's top wishes read at the viewer's visibility: a viewer sees
// the wishes they may see, the owner every one.
describe("the top wishes widget", () => {
  it("reads wishes at the viewer's visibility", async () => {
    const harness = createPluginHarness({
      dataDir: "/tmp/test-wishlist-widget",
    });
    const registered: Registration[] = [];
    harness
      .getMockShell()
      .getMessageBus()
      .subscribe(dashboardWidgetRegisterContract.name, async (message) => {
        if (isRegistration(message.payload)) registered.push(message.payload);
        return { success: true };
      });
    await harness.installPlugin(wishlistPlugin());
    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});
    for (const [id, visibility] of [
      ["send-emails", "public"],
      ["board-minutes", "restricted"],
    ] as const) {
      await harness.getEntityService().createEntity({
        entity: {
          id,
          entityType: "wish",
          content: "",
          metadata: {
            title: id,
            status: "new",
            priority: "medium",
            requested: 1,
            slug: id,
          },
          visibility,
        },
      });
    }
    const [widget] = registered;
    if (!widget) throw new Error("No widget registered");
    const load = (permission: UserPermissionLevel): Promise<unknown> =>
      widget.dataProvider({
        caller: { actor: { id: "viewer" }, permission, isAnchor: false },
        signal: new AbortController().signal,
      });

    expect(widget).toMatchObject({ id: "top-wishes", pluginId: "wishlist" });
    expect(await load("public")).toMatchObject({
      digest: { items: [{ label: "Top wish", value: "send-emails · ×1" }] },
    });
    expect(await load("public")).toMatchObject({
      view: {
        blocks: [{ items: [expect.objectContaining({ id: "send-emails" })] }],
      },
    });
    expect(await load("admin")).toMatchObject({
      view: {
        blocks: [
          {
            items: expect.arrayContaining([
              expect.objectContaining({ id: "send-emails" }),
              expect.objectContaining({ id: "board-minutes" }),
            ]),
          },
        ],
      },
    });
    await harness.reset();
  });
});
