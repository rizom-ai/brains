import { describe, expect, it } from "bun:test";
import { a2aConfigSchema } from "../src/config";

describe("A2A configuration", () => {
  it("refuses the retired port setting, saying to remove it", () => {
    expect(() => a2aConfigSchema.parse({ port: 3334 })).toThrow(
      /port is no longer supported: A2A is served by the brain's own web server; remove this setting/,
    );
  });

  it("reads a configuration without it", () => {
    expect(a2aConfigSchema.parse({})).not.toHaveProperty("port");
  });
});
