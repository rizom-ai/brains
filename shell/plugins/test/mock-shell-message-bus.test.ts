import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";

describe("mock shell message bus", () => {
  const schema = z.object({ id: z.string() });

  it("returns the parsed data for a message the schema accepts", () => {
    const bus = createMockShell().getMessageBus();

    const result = bus.validateMessage({ id: "abc" }, schema);

    expect(result).toEqual({ valid: true, data: { id: "abc" } });
  });

  it("reports the failure for a message the schema rejects", () => {
    const bus = createMockShell().getMessageBus();

    const result = bus.validateMessage({ id: 7 }, schema);

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected the schema to reject");
    expect(result.error).not.toBe("");
  });
});
