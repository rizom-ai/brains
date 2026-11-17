import { describe, expect, it } from "bun:test";
import { mcpConfigSchema } from "../src/config";

describe("MCP configuration", () => {
  it("refuses the retired port setting, saying to remove it", () => {
    expect(() => mcpConfigSchema.parse({ httpPort: 3333 })).toThrow(
      /httpPort is no longer supported: MCP is served by the brain's own web server; remove this setting/,
    );
  });

  it("reads a configuration without it", () => {
    expect(mcpConfigSchema.parse({})).toEqual({
      mode: "basic",
      transport: "http",
    });
  });
});
