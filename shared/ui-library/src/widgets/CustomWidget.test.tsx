import { describe, it, expect } from "bun:test";
import { render } from "preact-render-to-string";
import { CustomWidget } from "./CustomWidget";

describe("CustomWidget", () => {
  it("should render title", () => {
    const html = render(CustomWidget({ title: "Identity", data: {} }));
    expect(html).toContain("Identity");
  });

  it("should render key-value pairs from data", () => {
    const html = render(
      CustomWidget({
        title: "Info",
        data: { name: "Test Brain", version: "1.0" },
      }),
    );
    expect(html).toContain("name");
    expect(html).toContain("Test Brain");
    expect(html).toContain("version");
    expect(html).toContain("1.0");
  });

  it("should stringify nested objects", () => {
    const html = render(
      CustomWidget({
        title: "Complex",
        data: { nested: { a: 1, b: 2 } },
      }),
    );
    expect(html).toContain("nested");
    expect(html).toContain("{");
  });

  it("should handle empty data", () => {
    const html = render(CustomWidget({ title: "Empty", data: {} }));
    expect(html).toContain("Empty");
  });
});
