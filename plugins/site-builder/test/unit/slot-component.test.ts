import { describe, it, expect } from "bun:test";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { Slot } from "../../src/components/Slot";
import { UISlotRegistry } from "../../src/lib/ui-slot-registry";

describe("Slot component", () => {
  it("should render nothing when slots is undefined", () => {
    const html = render(h(Slot, { name: "footer-top" }));
    expect(html).toBe("");
  });

  it("should render nothing when slot has no registrations", () => {
    const slots = new UISlotRegistry();
    const html = render(h(Slot, { name: "footer-top", slots }));
    expect(html).toBe("");
  });

  it("should render registered component", () => {
    const slots = new UISlotRegistry();

    slots.register("footer-top", {
      pluginId: "test",
      render: () => h("div", { class: "test-component" }, "Hello"),
    });

    const html = render(h(Slot, { name: "footer-top", slots }));
    expect(html).toContain("test-component");
    expect(html).toContain("Hello");
  });

  it("should render multiple components in priority order", () => {
    const slots = new UISlotRegistry();

    slots.register("footer-top", {
      pluginId: "low",
      render: () => h("span", {}, "Low"),
      priority: 10,
    });

    slots.register("footer-top", {
      pluginId: "high",
      render: () => h("span", {}, "High"),
      priority: 100,
    });

    slots.register("footer-top", {
      pluginId: "medium",
      render: () => h("span", {}, "Medium"),
      priority: 50,
    });

    const html = render(h(Slot, { name: "footer-top", slots }));

    const highPos = html.indexOf("High");
    const mediumPos = html.indexOf("Medium");
    const lowPos = html.indexOf("Low");

    expect(highPos).toBeLessThan(mediumPos);
    expect(mediumPos).toBeLessThan(lowPos);
  });

  it("should only render components for the specified slot name", () => {
    const slots = new UISlotRegistry();

    slots.register("footer-top", {
      pluginId: "footer",
      render: () => h("div", {}, "Footer content"),
    });

    slots.register("sidebar", {
      pluginId: "sidebar",
      render: () => h("div", {}, "Sidebar content"),
    });

    const html = render(h(Slot, { name: "footer-top", slots }));
    expect(html).toContain("Footer content");
    expect(html).not.toContain("Sidebar content");
  });
});
