import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { cliToolFields, resolveCliToolFlags } from "../src/schema-map";

const build = [{ name: "environment", boolean: false }];
const sync = [
  { name: "action", boolean: false },
  { name: "full", boolean: true },
];

describe("cliToolFields", () => {
  it("names each input field and whether it is a switch", () => {
    expect(
      cliToolFields({
        environment: z.enum(["preview", "production"]).optional(),
        full: z.boolean().optional(),
        limit: z.number().default(10),
      }),
    ).toEqual([
      { name: "environment", boolean: false },
      { name: "full", boolean: true },
      { name: "limit", boolean: false },
    ]);
  });
});

describe("resolveCliToolFlags", () => {
  it("passes a flag that names an input field", () => {
    expect(
      resolveCliToolFlags("build", build, { environment: "preview" }),
    ).toEqual({ flags: { environment: "preview" } });
    expect(resolveCliToolFlags("sync", sync, { full: true })).toEqual({
      flags: { full: true },
    });
  });

  it("rejects a flag that names no input field, suggesting the closest", () => {
    expect(
      resolveCliToolFlags("build", build, { enviroment: "preview" }),
    ).toEqual({
      error:
        "Unknown flag --enviroment for `brain build`. Did you mean --environment? Run `brain build --help` for the flags it accepts.",
    });
    expect(resolveCliToolFlags("sync", sync, { cli: true })).toEqual({
      error:
        "Unknown flag --cli for `brain sync`. Run `brain sync --help` for the flags it accepts.",
    });
  });

  it("rejects a value given to a switch", () => {
    const result = resolveCliToolFlags("sync", sync, { full: "status" });

    expect("error" in result && result.error).toContain(
      "--full is a switch and takes no value",
    );
  });

  it("rejects a field flag without its value", () => {
    const result = resolveCliToolFlags("build", build, { environment: true });

    expect("error" in result && result.error).toContain(
      "--environment needs a value",
    );
  });

  it("asks a tool with an environment for its preview", () => {
    expect(resolveCliToolFlags("build", build, { preview: true })).toEqual({
      flags: { environment: "preview" },
    });
  });

  it("rejects --preview for a tool without an environment", () => {
    expect(resolveCliToolFlags("status", [], { preview: true })).toEqual({
      error:
        "Unknown flag --preview for `brain status`: it has no environment to preview. Run `brain status --help` for the flags it accepts.",
    });
  });

  it("leaves --preview to a tool with a field of that name", () => {
    expect(
      resolveCliToolFlags("publish", [{ name: "preview", boolean: true }], {
        preview: true,
      }),
    ).toEqual({ flags: { preview: true } });
  });
});
