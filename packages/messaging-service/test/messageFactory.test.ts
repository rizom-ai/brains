import { describe, expect, it } from "bun:test";
import { MessageFactory } from "@/messageFactory";
import { baseMessageSchema, messageResponseSchema } from "@/types";

describe("MessageFactory", () => {
  describe("createMessage", () => {
    it("should create a valid base message", () => {
      const message = MessageFactory.createMessage(
        "test.event",
        "source",
        "target",
      );

      expect(message.type).toBe("test.event");
      expect(message.source).toBe("source");
      expect(message.target).toBe("target");
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();

      // Validate against schema
      const parsed = baseMessageSchema.parse(message);
      expect(parsed).toEqual(message);
    });

    it("should create message without source and target", () => {
      const message = MessageFactory.createMessage("test.event");

      expect(message.type).toBe("test.event");
      expect(message.source).toBeUndefined();
      expect(message.target).toBeUndefined();
    });
  });

  describe("createMessageWithPayload", () => {
    it("should create a message with payload", () => {
      const payload = { data: "test", count: 42 };
      const message = MessageFactory.createMessageWithPayload(
        "test.data",
        payload,
        "source",
      );

      expect(message.type).toBe("test.data");
      expect(message.payload).toEqual(payload);
      expect(message.source).toBe("source");
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });
  });

  describe("createErrorResponse", () => {
    it("should create a valid error response", () => {
      const response = MessageFactory.createErrorResponse(
        "request-123",
        "VALIDATION_ERROR",
        "Invalid input data",
      );

      expect(response.requestId).toBe("request-123");
      expect(response.success).toBe(false);
      expect(response.error).toEqual({
        code: "VALIDATION_ERROR",
        message: "Invalid input data",
      });
      expect(response.data).toBeUndefined();

      // Validate against schema
      const parsed = messageResponseSchema.parse(response);
      expect(parsed).toEqual(response);
    });
  });

  describe("createSuccessResponse", () => {
    it("should create a success response without data", () => {
      const response = MessageFactory.createSuccessResponse("request-123");

      expect(response.requestId).toBe("request-123");
      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
      expect(response.data).toBeUndefined();

      // Validate against schema
      const parsed = messageResponseSchema.parse(response);
      expect(parsed).toEqual(response);
    });

    it("should create a success response with data", () => {
      const data = { result: "success", items: [1, 2, 3] };
      const response = MessageFactory.createSuccessResponse(
        "request-123",
        data,
      );

      expect(response.requestId).toBe("request-123");
      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.error).toBeUndefined();
    });
  });
});