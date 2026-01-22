import { describe, it, expect } from "bun:test";
import { render } from "preact-render-to-string";
import { ListWidget } from "./ListWidget";

describe("ListWidget", () => {
  it("should render title", () => {
    const html = render(ListWidget({ title: "Active Jobs", data: {} }));
    expect(html).toContain("Active Jobs");
  });

  it("should render jobs list", () => {
    const html = render(
      ListWidget({
        title: "Jobs",
        data: {
          jobs: [
            { id: "job-1", type: "sync" },
            { id: "job-2", type: "build" },
          ],
        },
      }),
    );
    // Displays type when available, falls back to id
    expect(html).toContain("sync");
    expect(html).toContain("build");
  });

  it("should render batches list", () => {
    const html = render(
      ListWidget({
        title: "Batches",
        data: {
          batches: [{ id: "batch-1" }, { id: "batch-2" }],
        },
      }),
    );
    expect(html).toContain("batch-1");
    expect(html).toContain("batch-2");
  });

  it("should show empty message when no items", () => {
    const html = render(ListWidget({ title: "Empty", data: {} }));
    expect(html).toContain("No active items");
  });

  it("should show empty message for empty arrays", () => {
    const html = render(
      ListWidget({ title: "Empty", data: { jobs: [], batches: [] } }),
    );
    expect(html).toContain("No active items");
  });
});
