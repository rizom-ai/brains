import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils";
import type { Logger, ProgressReporter } from "@brains/utils";
import { BaseJobHandler } from "../src/base-job-handler";

// Test input schema - using simple types without defaults for type compatibility
const testJobSchema = z.object({
  title: z.string(),
  content: z.string().optional(),
  count: z.number(),
});

type TestJobData = z.infer<typeof testJobSchema>;

interface TestJobResult {
  success: boolean;
  processedTitle: string;
}

// Concrete implementation for testing
class TestJobHandler extends BaseJobHandler<
  "test",
  TestJobData,
  TestJobResult
> {
  public processCallCount = 0;
  public lastProcessedData: TestJobData | null = null;
  public shouldThrow = false;

  constructor(logger: Logger) {
    super(logger, {
      schema: testJobSchema,
      jobTypeName: "test-job",
    });
  }

  async process(
    data: TestJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<TestJobResult> {
    this.processCallCount++;
    this.lastProcessedData = data;

    if (this.shouldThrow) {
      throw new Error("Process failed intentionally");
    }

    await this.reportProgress(progressReporter, {
      progress: 50,
      message: "Processing",
    });

    return {
      success: true,
      processedTitle: data.title.toUpperCase(),
    };
  }
}

// Implementation with custom summarizeDataForLog
class CustomLoggingHandler extends BaseJobHandler<
  "custom",
  TestJobData,
  TestJobResult
> {
  constructor(logger: Logger) {
    super(logger, {
      schema: testJobSchema,
      jobTypeName: "custom-job",
    });
  }

  async process(
    data: TestJobData,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<TestJobResult> {
    return {
      success: true,
      processedTitle: data.title,
    };
  }

  protected override summarizeDataForLog(
    data: TestJobData,
  ): Record<string, unknown> {
    return {
      title: data.title,
      hasContent: !!data.content,
    };
  }
}

// Implementation with overridden validateAndParse
class CustomValidationHandler extends BaseJobHandler<
  "custom-validation",
  TestJobData,
  TestJobResult
> {
  constructor(logger: Logger) {
    super(logger, {
      schema: testJobSchema,
      jobTypeName: "custom-validation-job",
    });
  }

  async process(
    data: TestJobData,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<TestJobResult> {
    return {
      success: true,
      processedTitle: data.title,
    };
  }

  override validateAndParse(data: unknown): TestJobData | null {
    const result = super.validateAndParse(data);
    if (result && result.title === "forbidden") {
      this.logger.warn("Forbidden title rejected");
      return null;
    }
    return result;
  }
}

describe("BaseJobHandler", () => {
  let mockLogger: Logger;
  let mockProgressReporter: ProgressReporter;

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      child: mock(() => mockLogger),
    } as unknown as Logger;

    mockProgressReporter = {
      report: mock(() => Promise.resolve()),
    } as unknown as ProgressReporter;
  });

  describe("validateAndParse", () => {
    it("should validate and parse valid data", () => {
      const handler = new TestJobHandler(mockLogger);
      const data = { title: "Test Title", content: "Test content", count: 5 };

      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test Title");
      expect(result?.content).toBe("Test content");
      expect(result?.count).toBe(5);
    });

    it("should handle optional fields", () => {
      const handler = new TestJobHandler(mockLogger);
      const data = { title: "Test Title", count: 0 };

      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.content).toBeUndefined();
    });

    it("should return null for invalid data", () => {
      const handler = new TestJobHandler(mockLogger);
      const invalidData = { title: 123 }; // title should be string

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("should return null for missing required fields", () => {
      const handler = new TestJobHandler(mockLogger);
      const invalidData = { content: "No title" };

      const result = handler.validateAndParse(invalidData);

      expect(result).toBeNull();
    });

    it("should log debug on successful validation", () => {
      const handler = new TestJobHandler(mockLogger);
      const data = { title: "Test", count: 0 };

      handler.validateAndParse(data);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "test-job job data validation successful",
        expect.any(Object),
      );
    });

    it("should log warning with validation errors on failure", () => {
      const handler = new TestJobHandler(mockLogger);
      const invalidData = { title: 123 };

      handler.validateAndParse(invalidData);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Invalid test-job job data",
        expect.objectContaining({
          data: invalidData,
          validationError: expect.any(Array),
        }),
      );
    });
  });

  describe("onError", () => {
    it("should log error with job context", async () => {
      const handler = new TestJobHandler(mockLogger);
      const error = new Error("Something went wrong");
      const data: TestJobData = { title: "Test", count: 0 };

      await handler.onError(error, data, "job-123", mockProgressReporter);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "test-job job error handler triggered",
        expect.objectContaining({
          jobId: "job-123",
          errorMessage: "Something went wrong",
          errorStack: expect.any(String),
        }),
      );
    });

    it("should include summarized data in error log", async () => {
      const handler = new CustomLoggingHandler(mockLogger);
      const error = new Error("Failed");
      const data: TestJobData = {
        title: "Test",
        content: "Some content",
        count: 5,
      };

      await handler.onError(error, data, "job-456", mockProgressReporter);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "custom-job job error handler triggered",
        expect.objectContaining({
          data: { title: "Test", hasContent: true },
        }),
      );
    });
  });

  describe("reportProgress", () => {
    it("should call progress reporter with step data", async () => {
      const handler = new TestJobHandler(mockLogger);
      const data: TestJobData = { title: "Test", count: 0 };

      await handler.process(data, "job-123", mockProgressReporter);

      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 50,
        total: 100,
        message: "Processing",
      });
    });

    it("should use custom total when provided", async () => {
      // Create a handler that uses custom total
      class CustomProgressHandler extends BaseJobHandler<
        "progress",
        TestJobData,
        TestJobResult
      > {
        constructor(logger: Logger) {
          super(logger, { schema: testJobSchema, jobTypeName: "progress-job" });
        }

        async process(
          _data: TestJobData,
          _jobId: string,
          progressReporter: ProgressReporter,
        ): Promise<TestJobResult> {
          await this.reportProgress(progressReporter, {
            progress: 2,
            total: 5,
            message: "Step 2 of 5",
          });
          return { success: true, processedTitle: "test" };
        }
      }

      const handler = new CustomProgressHandler(mockLogger);
      const data: TestJobData = { title: "Test", count: 0 };
      await handler.process(data, "job-123", mockProgressReporter);

      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 2,
        total: 5,
        message: "Step 2 of 5",
      });
    });
  });

  describe("summarizeDataForLog", () => {
    it("should use default summarization (return data as-is)", () => {
      const handler = new TestJobHandler(mockLogger);
      const data: TestJobData = { title: "Test", content: "Content", count: 5 };

      handler.validateAndParse(data);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: { title: "Test", content: "Content", count: 5 },
        }),
      );
    });

    it("should use custom summarization when overridden", () => {
      const handler = new CustomLoggingHandler(mockLogger);
      const data: TestJobData = { title: "Test", content: "Content", count: 5 };

      handler.validateAndParse(data);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: { title: "Test", hasContent: true },
        }),
      );
    });
  });

  describe("custom validation override", () => {
    it("should allow overriding validateAndParse for custom logic", () => {
      const handler = new CustomValidationHandler(mockLogger);

      // Valid data should pass
      const validResult = handler.validateAndParse({
        title: "allowed",
        count: 0,
      });
      expect(validResult).not.toBeNull();

      // Forbidden title should be rejected
      const forbiddenResult = handler.validateAndParse({
        title: "forbidden",
        count: 0,
      });
      expect(forbiddenResult).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith("Forbidden title rejected");
    });
  });

  describe("process implementation", () => {
    it("should be abstract and require implementation", async () => {
      const handler = new TestJobHandler(mockLogger);
      const data: TestJobData = { title: "Test", count: 0 };

      const result = await handler.process(
        data,
        "job-123",
        mockProgressReporter,
      );

      expect(result.success).toBe(true);
      expect(result.processedTitle).toBe("TEST");
      expect(handler.processCallCount).toBe(1);
      expect(handler.lastProcessedData).toEqual(data);
    });
  });

  describe("type safety", () => {
    it("should enforce type constraints on input and output", () => {
      const handler = new TestJobHandler(mockLogger);

      // This test verifies compile-time type safety
      // The handler should only accept TestJobData and return TestJobResult
      const validData: TestJobData = { title: "Test", count: 0 };
      expect(handler.validateAndParse(validData)).not.toBeNull();
    });
  });
});
