import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import type { JobHandler } from "./types";

/**
 * Configuration options for BaseJobHandler
 */
export interface BaseJobHandlerConfig<TInput> {
  /** The Zod schema used to validate job input data */
  schema: z.ZodSchema<TInput>;
  /** The name of the job type (used in log messages) */
  jobTypeName: string;
}

/**
 * Progress step helper for cleaner progress reporting
 */
export interface ProgressStep {
  progress: number;
  total?: number;
  message: string;
}

/**
 * Abstract base class for job handlers that provides common boilerplate
 *
 * This class implements the standard validateAndParse() and onError() methods
 * that are duplicated across all job handlers. Subclasses only need to:
 * 1. Pass a schema and job type name to the constructor
 * 2. Implement the abstract process() method
 *
 * @template TJobType - The job type string
 * @template TInput - The input data type (inferred from schema)
 * @template TOutput - The output data type
 *
 * @example
 * ```typescript
 * export class MyJobHandler extends BaseJobHandler<"my-job", MyJobData, MyResult> {
 *   constructor(logger: Logger, private context: ServicePluginContext) {
 *     super(logger, {
 *       schema: myJobSchema,
 *       jobTypeName: "my-job",
 *     });
 *   }
 *
 *   async process(data: MyJobData, jobId: string, progressReporter: ProgressReporter): Promise<MyResult> {
 *     await this.reportProgress(progressReporter, { progress: 0, message: "Starting" });
 *     // ... implementation
 *     return result;
 *   }
 * }
 * ```
 */
export abstract class BaseJobHandler<
  TJobType extends string = string,
  TInput = unknown,
  TOutput = unknown,
> implements JobHandler<TJobType, TInput, TOutput>
{
  protected readonly logger: Logger;
  protected readonly schema: z.ZodSchema<TInput>;
  protected readonly jobTypeName: string;

  /**
   * Create a new BaseJobHandler
   *
   * @param logger - Logger instance for the handler
   * @param config - Configuration including schema and job type name
   */
  constructor(logger: Logger, config: BaseJobHandlerConfig<TInput>) {
    this.logger = logger;
    this.schema = config.schema;
    this.jobTypeName = config.jobTypeName;
  }

  /**
   * Process a job - must be implemented by subclasses
   *
   * @param data - The validated job input data
   * @param jobId - Unique identifier for this job
   * @param progressReporter - Progress reporter for granular updates
   */
  abstract process(
    data: TInput,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<TOutput>;

  /**
   * Validate and parse job data using the configured Zod schema
   *
   * Override this method if you need custom validation logic,
   * such as cleaning up undefined optional properties.
   *
   * @param data - Raw job data to validate
   * @returns Parsed data if valid, null if invalid
   */
  validateAndParse(data: unknown): TInput | null {
    try {
      const result = this.schema.parse(data);

      this.logger.debug(`${this.jobTypeName} job data validation successful`, {
        data: this.summarizeDataForLog(result),
      });

      return result;
    } catch (error) {
      this.logger.warn(`Invalid ${this.jobTypeName} job data`, {
        data,
        validationError: error instanceof z.ZodError ? error.issues : error,
      });
      return null;
    }
  }

  /**
   * Handle job errors with standard logging
   *
   * Override this method if you need custom error handling logic,
   * such as cleanup operations or notifications.
   *
   * @param error - The error that occurred
   * @param data - The job input data
   * @param jobId - The job identifier
   * @param _progressReporter - The progress reporter (unused in default implementation)
   */
  async onError(
    error: Error,
    data: TInput,
    jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<void> {
    this.logger.error(`${this.jobTypeName} job error handler triggered`, {
      jobId,
      errorMessage: error.message,
      errorStack: error.stack,
      data: this.summarizeDataForLog(data),
    });
  }

  /**
   * Helper method for reporting progress with a cleaner API
   *
   * @param reporter - The progress reporter
   * @param step - The progress step to report
   */
  protected async reportProgress(
    reporter: ProgressReporter,
    step: ProgressStep,
  ): Promise<void> {
    await reporter.report({
      progress: step.progress,
      total: step.total ?? 100,
      message: step.message,
    });
  }

  /**
   * Summarize data for logging - override to customize what gets logged
   *
   * This method is called by validateAndParse and onError to create
   * a summary of the data for log messages. Override to include
   * relevant fields without logging sensitive data.
   *
   * @param data - The job data to summarize
   * @returns An object suitable for logging
   */
  protected summarizeDataForLog(data: TInput): Record<string, unknown> {
    // Default: return the data as-is (subclasses can override)
    return data as Record<string, unknown>;
  }
}
