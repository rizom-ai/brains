import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils";
import { toModelVisibleInputSchema } from "../src/sdk-tools";

describe("toModelVisibleInputSchema", () => {
  it("hides internal confirmation fields from model-visible tool schemas", () => {
    const inputSchema = toModelVisibleInputSchema({
      entityType: z.string(),
      id: z.string(),
      confirmed: z.literal(true).optional(),
      confirmationToken: z.string().optional(),
      contentHash: z.string().optional(),
    });

    expect(Object.keys(inputSchema)).toEqual(["entityType", "id"]);
  });
});
