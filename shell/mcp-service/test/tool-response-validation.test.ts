import { describe, expect, it } from "bun:test";
import { createMockLogger } from "@brains/test-utils";
import {
  normalizeToolExecutionMessageResponse,
  normalizeToolResponse,
} from "../src/tool-response-validation";

function context(): {
  pluginId: string;
  toolName: string;
  logger: ReturnType<typeof createMockLogger>;
} {
  return {
    pluginId: "test-plugin",
    toolName: "test_tool",
    logger: createMockLogger(),
  };
}

describe("tool response validation", () => {
  it("passes compliant tool responses through unchanged", () => {
    expect(
      normalizeToolResponse(
        { success: true, data: { value: "ok" } },
        context(),
      ),
    ).toEqual({ success: true, data: { value: "ok" } });
    expect(
      normalizeToolResponse({ success: false, error: "Nope" }, context()),
    ).toEqual({ success: false, error: "Nope" });
    expect(
      normalizeToolResponse(
        {
          needsConfirmation: true,
          toolName: "test_tool",
          description: "Confirm?",
          args: { id: "123" },
        },
        context(),
      ),
    ).toEqual({
      needsConfirmation: true,
      toolName: "test_tool",
      description: "Confirm?",
      args: { id: "123" },
    });
  });

  it("coerces missing success data and extra response keys to tool errors", () => {
    const first = context();
    const second = context();

    expect(normalizeToolResponse({ success: true }, first)).toEqual({
      success: false,
      error: "Tool test_tool returned an invalid response shape",
    });
    expect(
      normalizeToolResponse(
        { success: true, data: "ok", formatted: "extra" },
        second,
      ),
    ).toEqual({
      success: false,
      error: "Tool test_tool returned an invalid response shape",
    });
    expect(first.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant response",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    expect(second.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant response",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });

  it("normalizes compliant tool message response envelopes", () => {
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
        { success: false, error: "Plugin failed" },
        context(),
      ),
    ).toEqual({ success: false, error: "Plugin failed" });
  });

  it("coerces invalid tool message payloads without rejecting the envelope", () => {
    const validationContext = context();

    expect(
      normalizeToolExecutionMessageResponse(
        { success: true, data: { success: true, formatted: "extra" } },
        validationContext,
      ),
    ).toEqual({
      success: true,
      data: {
        success: false,
        error: "Tool test_tool returned an invalid response shape",
      },
    });
    expect(validationContext.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant response",
      expect.objectContaining({
        pluginId: "test-plugin",
        toolName: "test_tool",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects invalid tool message response envelopes", () => {
    const validationContext = context();

    expect(
      normalizeToolExecutionMessageResponse(
        { success: true },
        validationContext,
      ),
    ).toEqual({
      success: false,
      error: "Tool test_tool returned an invalid message response envelope",
    });
    expect(validationContext.logger.error).toHaveBeenCalledWith(
      "Tool returned non-compliant message response",
      expect.objectContaining({
        pluginId: "test-plugin",
        toolName: "test_tool",
      }),
    );
  });
});
