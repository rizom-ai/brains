import pRetry from "p-retry";
import type { Logger } from "@brains/utils";

export interface RetryConfig {
  operation: string;
  logger?: Logger;
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
  onFailedAttempt?: (error: { attemptNumber: number; retriesLeft: number; message: string }) => void | Promise<void>;
}

export class RetryHandler {
  constructor(private readonly logger?: Logger) {}

  public async retry<T>(
    fn: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    const { operation, logger = this.logger, onFailedAttempt, ...retryOptions } = config;

    return pRetry(fn, {
      ...retryOptions,
      onFailedAttempt: (error) => {
        logger?.warn(
          `${operation} attempt ${error.attemptNumber} failed: ${error.message}`
        );
        void onFailedAttempt?.(error);
      },
    });
  }

  public static createWithDefaults(
    logger?: Logger,
    defaults?: Partial<RetryConfig>
  ): RetryHandler {
    const handler = new RetryHandler(logger);
    const originalRetry = handler.retry.bind(handler);

    handler.retry = async <T>(
      fn: () => Promise<T>,
      config: RetryConfig
    ): Promise<T> => {
      return originalRetry(fn, { ...defaults, ...config });
    };

    return handler;
  }
}