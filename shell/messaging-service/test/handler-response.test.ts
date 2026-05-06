import { describe, expect, it } from "bun:test";
import { parseHandlerResponse } from "@/handler-response";

describe("parseHandlerResponse", () => {
  it("accepts a noop response", () => {
    expect(parseHandlerResponse({ noop: true })).toEqual({ noop: true });
  });

  it("accepts a minimal success response", () => {
    expect(parseHandlerResponse({ success: true })).toEqual({ success: true });
  });

  it("accepts a success response with data", () => {
    const result = parseHandlerResponse({ success: true, data: { id: "x" } });
    expect(result).toEqual({ success: true, data: { id: "x" } });
  });

  it("accepts a failure response with an error string", () => {
    const result = parseHandlerResponse({ success: false, error: "boom" });
    expect(result).toEqual({ success: false, error: "boom" });
  });

  it("rejects null", () => {
    expect(() => parseHandlerResponse(null)).toThrow(
      "Invalid message response format",
    );
  });

  it("rejects undefined", () => {
    expect(() => parseHandlerResponse(undefined)).toThrow(
      "Invalid message response format",
    );
  });

  it("rejects a primitive value", () => {
    expect(() => parseHandlerResponse("ok")).toThrow(
      "Invalid message response format",
    );
  });

  it("rejects a response missing the success field", () => {
    expect(() => parseHandlerResponse({ data: "x" })).toThrow(
      "Invalid message response format",
    );
  });

  it("rejects a response with a non-boolean success", () => {
    expect(() => parseHandlerResponse({ success: "yes" })).toThrow(
      "Invalid message response format",
    );
  });

  it("rejects noop: false (only literal true is valid)", () => {
    expect(() => parseHandlerResponse({ noop: false })).toThrow(
      "Invalid message response format",
    );
  });

  it("rejects a response where error is not a string", () => {
    expect(() =>
      parseHandlerResponse({ success: false, error: { message: "boom" } }),
    ).toThrow("Invalid message response format");
  });
});
