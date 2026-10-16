import { describe, expect, it } from "bun:test";
import { DefaultContentFormatter } from "./default-content-formatter";
import { DefaultYamlFormatter } from "./default-yaml";

const oversized = `base: &base {}\nresult: { <<: [${Array(101).fill("*base").join(", ")}] }`;

describe("YAML formatter parser limits", () => {
  it("refuses oversized merges in the typed YAML code-block formatter", () => {
    const formatter = new DefaultYamlFormatter();
    expect(() => formatter.parse(`\`\`\`yaml\n${oversized}\n\`\`\``)).toThrow(
      "abnormal merge sequence size",
    );
  });

  it("preserves the generic formatter's plain-text fallback on refused YAML", () => {
    const formatter = new DefaultContentFormatter();
    expect(formatter.parse(oversized)).toBe(oversized);
  });

  it("round-trips ordinary structured extension data through both formatters", () => {
    const data = {
      title: "Authored",
      extension: { labels: ["one", "two"], enabled: false },
    };
    for (const formatter of [
      new DefaultYamlFormatter(),
      new DefaultContentFormatter(),
    ]) {
      expect(formatter.parse(formatter.format(data))).toEqual(data);
    }
  });
});
