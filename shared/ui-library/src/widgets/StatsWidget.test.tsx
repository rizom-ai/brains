import { describe, it, expect } from "bun:test";
import { render } from "preact-render-to-string";
import { StatsWidget } from "./StatsWidget";

describe("StatsWidget", () => {
  it("should render title", () => {
    const html = render(
      StatsWidget({ title: "Entity Stats", data: { notes: 42 } }),
    );
    expect(html).toContain("Entity Stats");
  });

  it("should render stats from data object", () => {
    const html = render(
      StatsWidget({
        title: "Stats",
        data: { notes: 42, links: 15 },
      }),
    );
    expect(html).toContain("notes");
    expect(html).toContain("42");
    expect(html).toContain("links");
    expect(html).toContain("15");
  });

  it("should render nested stats object", () => {
    const html = render(
      StatsWidget({
        title: "Stats",
        data: { stats: { notes: 10, tasks: 5 } },
      }),
    );
    expect(html).toContain("notes");
    expect(html).toContain("10");
    expect(html).toContain("tasks");
    expect(html).toContain("5");
  });

  it("should handle empty data", () => {
    const html = render(StatsWidget({ title: "Empty", data: {} }));
    expect(html).toContain("Empty");
  });
});
