import { describe, it, expect } from "bun:test";
import { parseEvalYaml } from "../src/eval-yaml-loader";

describe("parseEvalYaml", () => {
  it("should parse minimal eval.yaml with just plugin", () => {
    const result = parseEvalYaml(`plugin: "@brains/blog"`);
    expect(result).toEqual({ plugin: "@brains/blog" });
  });

  it("should parse eval.yaml with plugin config", () => {
    const result = parseEvalYaml(`
plugin: "@brains/blog"
config:
  autoGenerateOnPublish: false
`);
    expect(result).toEqual({
      plugin: "@brains/blog",
      config: { autoGenerateOnPublish: false },
    });
  });

  it("should return null for yaml without plugin field", () => {
    const result = parseEvalYaml(`brain: "@brains/rover"`);
    expect(result).toBeNull();
  });

  it("should return null for empty yaml", () => {
    const result = parseEvalYaml("");
    expect(result).toBeNull();
  });

  it("should return null for invalid yaml", () => {
    const result = parseEvalYaml(":::invalid:::");
    expect(result).toBeNull();
  });
});
