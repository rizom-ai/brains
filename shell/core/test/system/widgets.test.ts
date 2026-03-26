import { describe, expect, it } from "bun:test";
import { createSystemWidgets } from "../../src/system/widgets";
import { createMockSystemServices } from "./mock-services";

describe("system widgets", () => {
  it("should create entity-stats, character, profile, and system-info widgets", () => {
    const widgets = createSystemWidgets(createMockSystemServices());
    const ids = widgets.map((w) => w.id);

    expect(ids).toContain("entity-stats");
    expect(ids).toContain("character");
    expect(ids).toContain("profile");
    expect(ids).toContain("system-info");
  });

  it("entity-stats widget should provide data from entityService", async () => {
    const services = createMockSystemServices();
    const widgets = createSystemWidgets(services);
    const widget = widgets.find((w) => w.id === "entity-stats");
    const data = await widget?.dataProvider();

    expect(data).toHaveProperty("stats");
  });

  it("character widget should provide identity data", async () => {
    const widgets = createSystemWidgets(createMockSystemServices());
    const widget = widgets.find((w) => w.id === "character");
    const data = await widget?.dataProvider();

    expect(data).toHaveProperty("name", "Test Brain");
    expect(data).toHaveProperty("role", "Test");
  });

  it("profile widget should provide profile data", async () => {
    const widgets = createSystemWidgets(createMockSystemServices());
    const widget = widgets.find((w) => w.id === "profile");
    const data = await widget?.dataProvider();

    expect(data).toHaveProperty("name", "Test Owner");
  });
});
