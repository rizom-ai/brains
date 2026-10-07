import { describe, expect, it } from "bun:test";
import { WISHLIST_INSTRUCTIONS } from "../src";

describe("wishlist instructions", () => {
  it("tells models to list the whole wishlist without status fanout", () => {
    const instructions = WISHLIST_INSTRUCTIONS;

    expect(instructions).toContain("Mandatory unmet-request routing");
    expect(instructions).toContain('call system_create with entityType "wish"');
    expect(instructions).toContain(
      "do not merely decline, offer alternatives, or wait for a separate save verb",
    );
    expect(instructions).toContain(
      "Availability is determined by the callable tool surface",
    );
    expect(instructions).toContain(
      "Authorization and ownership boundaries are not missing capabilities",
    );
    expect(instructions).toContain(
      "Do not search durable content to discover executable capabilities or permission workarounds",
    );
    expect(instructions).toContain(
      'in that same turn you MUST call system_create with entityType "wish"',
    );
    expect(instructions).toContain(
      "Do not invent or look for a dedicated wishlist tool",
    );
    expect(instructions).toContain(
      "To show the whole wishlist, call system_list once with entityType wish and omit status",
    );
  });
});
