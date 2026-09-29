import { describe, expect, it, spyOn, type Mock } from "bun:test";
import { createMockLogger } from "@brains/test-utils";
import {
  normalizeToolExecutionMessageResponse,
  normalizeToolResponse,
  wrapToolWithResponseValidation,
} from "../src/tool-response-validation";

function context(): {
  pluginId: string;
  toolName: string;
  logger: ReturnType<typeof createMockLogger> & {
    error: Mock<ReturnType<typeof createMockLogger>["error"]>;
  };
} {
  const logger = createMockLogger();
  return {
    pluginId: "test-plugin",
    toolName: "test_tool",
    logger: Object.assign(logger, { error: spyOn(logger, "error") }),
  };
}

const invalid = {
  success: false,
  error: "Invalid response",
  code: "invalid_response",
} as const;
const secret = "private-token-and-request-body";

describe("tool response validation", () => {
  it("passes successful domain results and confirmations through unchanged", () => {
    for (const response of [
      { success: true, data: { value: "ok" } },
      { success: true, data: { success: false, reason: "already_exists" } },
      {
        success: false,
        error: "This entity already exists",
        code: "NATIVE_CONFLICT",
      },
      {
        needsConfirmation: true,
        toolName: "test_tool",
        summary: "Confirm?",
        args: { id: "123" },
      },
    ] as const) {
      expect(normalizeToolResponse(response, context())).toEqual(response);
    }
  });

  it("preserves thrown codes and sanitizes unclassified exceptions", async () => {
    for (const message of [secret, "different wording"]) {
      for (const code of ["not_found", undefined, "future_code"]) {
        const validation = context();
        const tool = wrapToolWithResponseValidation(
          "fixture",
          {
            name: "failure",
            description: "Throws a failure",
            inputSchema: {},
            handler: async () => {
              throw Object.assign(new Error(message), { code });
            },
          },
          validation.logger,
        );
        expect(
          await tool.handler(
            {},
            {
              interfaceType: "test",
              actor: { kind: "user", userId: "person" },
            },
          ),
        ).toEqual({
          success: false,
          code: code === "not_found" ? "not_found" : "handler_failed",
          error: code === "not_found" ? "Not found" : "The operation failed",
        });
        expect(
          JSON.stringify(validation.logger.error.mock.calls),
        ).not.toContain(secret);
      }
    }
  });

  it("coerces missing success data and extra response keys to coded errors", () => {
    const first = context();
    const second = context();
    expect(normalizeToolResponse({ success: true }, first)).toEqual(invalid);
    expect(
      normalizeToolResponse(
        { success: true, data: secret, formatted: secret },
        second,
      ),
    ).toEqual(invalid);
    expect(first.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant response",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    expect(second.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant response",
      expect.objectContaining({ issueCodes: expect.any(Array) }),
    );
    expect(JSON.stringify(second.logger.error.mock.calls)).not.toContain(
      secret,
    );
  });

  it("retains success envelopes and codes on bus-level refusals", () => {
    expect(
      normalizeToolExecutionMessageResponse(
        { success: true, data: { success: true, data: { value: "ok" } } },
        context(),
      ),
    ).toEqual({
      success: true,
      data: { success: true, data: { value: "ok" } },
    });
    expect(
      normalizeToolExecutionMessageResponse(
        { success: false, error: secret, code: "permission_denied" },
        context(),
      ),
    ).toEqual({
      success: false,
      error: "Permission denied",
      code: "permission_denied",
    });
    expect(
      normalizeToolExecutionMessageResponse(
        { success: false, error: secret, code: "future_code" },
        context(),
      ),
    ).toEqual({
      success: false,
      error: "The operation failed",
      code: "handler_failed",
    });
  });

  it("coerces invalid tool payloads without rejecting the envelope", () => {
    const validationContext = context();
    expect(
      normalizeToolExecutionMessageResponse(
        { success: true, data: { success: true, formatted: secret } },
        validationContext,
      ),
    ).toEqual({ success: true, data: invalid });
    expect(validationContext.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant response",
      expect.objectContaining({
        pluginId: "test-plugin",
        toolName: "test_tool",
        issueCodes: expect.any(Array),
      }),
    );
    expect(
      JSON.stringify(validationContext.logger.error.mock.calls),
    ).not.toContain(secret);
  });

  it("rejects invalid envelopes without logging their private contents", () => {
    const validationContext = context();
    expect(
      normalizeToolExecutionMessageResponse(
        { success: true, private: secret },
        validationContext,
      ),
    ).toEqual(invalid);
    expect(validationContext.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant message response",
      expect.objectContaining({
        pluginId: "test-plugin",
        toolName: "test_tool",
      }),
    );
    expect(
      JSON.stringify(validationContext.logger.error.mock.calls),
    ).not.toContain(secret);
  });
});
