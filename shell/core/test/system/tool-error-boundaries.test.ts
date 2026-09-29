import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { SdkError } from "@brains/contracts";
import type { ToolContext } from "@brains/mcp-service";
import { createSystemTool } from "../../src/system/tool-helpers";

const context: ToolContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "person" },
};
const secret = "private-token-and-request-body";

describe("native tool runtime failures", () => {
  it("sanitizes thrown exceptions without changing intentional protocol refusals", async () => {
    const refusal = {
      success: false,
      error: "This entity already exists",
    } as const;
    const native = createSystemTool(
      "refusal",
      "Refuses deliberately",
      z.object({}),
      async () => refusal,
    );
    expect(await native.handler({}, context)).toEqual(refusal);
    for (const error of [
      new Error(secret),
      new SdkError("not_found", { message: secret }),
    ]) {
      const tool = createSystemTool(
        "throws",
        "Throws",
        z.object({}),
        async () => {
          throw error;
        },
      );
      const answer = await tool.handler({}, context);
      expect(answer).toMatchObject({
        success: false,
        code: "code" in error ? "not_found" : "handler_failed",
      });
      expect(JSON.stringify(answer)).not.toContain(secret);
    }
  });

  it("classifies validator exceptions before executing the handler", async () => {
    let calls = 0;
    const tool = createSystemTool(
      "input",
      "Validates input",
      z.object({
        value: z.string().transform((): never => {
          throw new Error(secret);
        }),
      }),
      async () => {
        calls++;
        return { success: true, data: null };
      },
    );
    expect(await tool.handler({ value: "value" }, context)).toEqual({
      success: false,
      code: "invalid_input",
      error: "Invalid input",
    });
    expect(calls).toBe(0);
  });
});
