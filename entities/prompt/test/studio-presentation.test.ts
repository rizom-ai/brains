import { describe, expect, it } from "bun:test";
import { promptFrontmatterSchema, promptMetadataSchema } from "../src";
import { promptPlugin } from "./prompt-plugin";

function widget(field: { meta(): unknown }): unknown {
  const meta = field.meta();
  return typeof meta === "object" && meta !== null
    ? Reflect.get(meta, "studioWidget")
    : undefined;
}

function widgets(shape: Record<string, { meta(): unknown }>): unknown {
  return Object.fromEntries(
    Object.entries(shape)
      .map(([name, field]) => [name, widget(field)])
      .filter(([, value]) => value !== undefined),
  );
}

describe("a prompt in Studio", () => {
  it("shows where it came from as facts and hides its bookkeeping", () => {
    expect(widgets(promptFrontmatterSchema.shape)).toEqual({
      defaultHash: "hidden",
    });
  });

  it("edits the metadata it registers, with its derived slug hidden too", () => {
    expect(promptPlugin().adapter.frontmatterSchema).toBe(promptMetadataSchema);
    expect(widgets(promptMetadataSchema.shape)).toEqual({
      slug: "hidden",
      defaultHash: "hidden",
    });
  });
});
