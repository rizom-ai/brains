import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AutoCaptureHandler } from "../../src/handlers/auto-capture-handler";
import { LinkService } from "../../src/lib/link-service";
import { UrlUtils } from "../../src/lib/url-utils";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import { mockAIResponse } from "../fixtures/link-entities";

describe("AutoCaptureHandler", () => {
  let handler: AutoCaptureHandler;
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "link");

    // Reset singleton and create fresh instance
    AutoCaptureHandler.resetInstance();
    handler = AutoCaptureHandler.createFresh(context);

    // Mock progress reporter
    mockProgressReporter = {
      report: mock(async () => {}),
    };

    // Mock AI content generation
    context.generateContent = mock(async () => mockAIResponse.complete);
  });

  describe("process", () => {
    it("should capture a link successfully", async () => {
      const url = "https://example.com/article";
      const jobData = {
        url,
        metadata: {
          conversationId: "conv-123",
          userId: "user-456",
        },
      };

      const result = await handler.process(
        jobData,
        "job-123",
        mockProgressReporter,
      );

      // Verify entity ID is deterministic
      const expectedEntityId = UrlUtils.generateEntityId(url);
      expect(result).toBe(expectedEntityId);

      // Verify progress reporting
      expect(mockProgressReporter.report).toHaveBeenCalledTimes(2);
      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 10,
        message: `Capturing link: ${url}`,
      });
      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 100,
        message: "Successfully captured: Test Article",
      });
    });

    it("should handle capture without metadata", async () => {
      const url = "https://example.com/article";
      const jobData = { url };

      const result = await handler.process(
        jobData,
        "job-124",
        mockProgressReporter,
      );

      const expectedEntityId = UrlUtils.generateEntityId(url);
      expect(result).toBe(expectedEntityId);
    });

    it("should deduplicate links automatically", async () => {
      const url = "https://example.com/article";
      const jobData = { url };

      // First capture
      const result1 = await handler.process(
        jobData,
        "job-125",
        mockProgressReporter,
      );

      // Reset mocks for second capture
      mockProgressReporter.report = mock(async () => {});

      // Create new handler to reset internal state
      const handler2 = AutoCaptureHandler.createFresh(context);

      // Mock entity service to return existing entity
      context.entityService.getEntity = mock(async () => ({
        id: result1,
        entityType: "link",
        content: `# Test Article

## URL

https://example.com/article

## Description

Test description

## Summary

Test summary

## Content

Test content

## Keywords

- test

## Domain

example.com

## Captured

${new Date().toISOString()}`,
        metadata: {},
        createdAt: new Date().toISOString(),
        source: "plugin:link",
      }));

      // Reset AI mock to track calls
      const aiMock = mock(async () => mockAIResponse.complete);
      context.generateContent = aiMock;

      // Second capture of same URL
      const result2 = await handler2.process(
        jobData,
        "job-126",
        mockProgressReporter,
      );

      // Should return same entity ID
      expect(result2).toBe(result1);

      // AI should NOT be called for duplicate
      expect(aiMock).not.toHaveBeenCalled();
    });

    it("should handle capture errors", async () => {
      const url = "https://example.com/article";
      const jobData = { url };

      // Mock AI to throw error
      context.generateContent = mock(async () => {
        throw new Error("AI service error");
      });

      await expect(
        handler.process(jobData, "job-127", mockProgressReporter),
      ).rejects.toThrow("AI service error");
    });
  });

  describe("onError", () => {
    it("should handle and report errors", async () => {
      const error = new Error("Test error");
      const jobData = {
        url: "https://example.com/article",
      };

      await handler.onError(error, jobData, "job-128", mockProgressReporter);

      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 0,
        message: "Failed to capture link: Test error",
      });
    });
  });

  describe("validateAndParse", () => {
    it("should validate valid job data", () => {
      const validData = {
        url: "https://example.com/article",
        metadata: {
          conversationId: "conv-123",
        },
      };

      const result = handler.validateAndParse(validData);
      expect(result).toEqual(validData);
    });

    it("should reject invalid URL", () => {
      const invalidData = {
        url: "not-a-url",
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should reject missing URL", () => {
      const invalidData = {
        metadata: {},
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    it("should accept minimal valid data", () => {
      const validData = {
        url: "https://example.com",
      };

      const result = handler.validateAndParse(validData);
      expect(result).toEqual(validData);
    });
  });
});
