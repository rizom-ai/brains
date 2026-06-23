import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { createPluginHarness } from "@brains/plugins/test";
import { BusinessDevelopmentPlugin } from "../src";

interface RegisteredWidget {
  id: string;
  pluginId: string;
  title: string;
  rendererName: string;
  dataProvider: () => Promise<unknown>;
}

describe("BusinessDevelopmentPlugin dashboard", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-business-development-dashboard-${randomUUID()}`,
    });
  });

  it("registers a focus widget after plugins are ready", async () => {
    const registrations: RegisteredWidget[] = [];
    harness.subscribe("dashboard:register-widget", async (message) => {
      registrations.push(message.payload as RegisteredWidget);
      return { success: true };
    });

    await harness.installPlugin(new BusinessDevelopmentPlugin());
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      id: "business-development-focus",
      pluginId: "business-development",
      title: "Business Development Focus",
      rendererName: "ListWidget",
    });
  });

  it("returns an empty focus widget state when no opportunities exist", async () => {
    let widget: RegisteredWidget | undefined;
    harness.subscribe("dashboard:register-widget", async (message) => {
      widget = message.payload as RegisteredWidget;
      return { success: true };
    });

    await harness.installPlugin(new BusinessDevelopmentPlugin());
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    const data = await widget?.dataProvider();

    expect(data).toEqual({ items: [] });
  });

  it("provides the top two eligible opportunities for the focus widget", async () => {
    let widget: RegisteredWidget | undefined;
    harness.subscribe("dashboard:register-widget", async (message) => {
      widget = message.payload as RegisteredWidget;
      return { success: true };
    });

    await harness.installPlugin(new BusinessDevelopmentPlugin());
    harness.addEntities([
      {
        id: "first",
        entityType: "opportunity",
        content: "",
        metadata: {
          title: "First",
          slug: "first",
          type: "grant",
          state: "staged",
          incomePotential: 5,
          organizationalBuild: 5,
          brainsDevelopment: 5,
          integrity: 5,
        },
      },
      {
        id: "second",
        entityType: "opportunity",
        content: "",
        metadata: {
          title: "Second",
          slug: "second",
          type: "partnership",
          state: "warm",
          incomePotential: 4,
          organizationalBuild: 4,
          brainsDevelopment: 4,
          integrity: 4,
        },
      },
      {
        id: "misaligned",
        entityType: "opportunity",
        content: "",
        metadata: {
          title: "Misaligned",
          slug: "misaligned",
          type: "commercial",
          state: "warm",
          incomePotential: 5,
          organizationalBuild: 5,
          brainsDevelopment: 5,
          integrity: 0,
        },
      },
    ]);
    await harness.sendMessage("system:plugins:ready", {}, "shell");

    const data = await widget?.dataProvider();

    expect(data).toEqual({
      items: [
        {
          id: "first",
          name: "First",
          count: 22.5,
          priority: "active",
          status: "staged",
        },
        {
          id: "second",
          name: "Second",
          count: 18,
          priority: "active",
          status: "warm",
        },
      ],
    });
  });
});
