import type { LandingPageData } from '@website/schemas';

/**
 * Enum for tracking the status of section generation
 */
export enum SectionGenerationStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
  Retrying = 'retrying',
}

/**
 * Interface for section generation result including status and error details
 */
export interface SectionGenerationResult<T> {
  status: SectionGenerationStatus;
  data?: T;
  error?: string;
  retryCount?: number;
  duration?: number; // Time taken to generate in ms
}

/**
 * Type representing the generation status of all landing page sections
 */
export type LandingPageGenerationStatus = Record<string, SectionGenerationResult<unknown>>;

/**
 * Interface for options when generating landing page content
 */
export interface LandingPageGenerationOptions {
  maxRetries?: number;
  continueOnError?: boolean;
  simplifyPrompt?: boolean;
  isRetry?: boolean;
}

/**
 * Interface for options when generating a specific section
 */
export interface SectionGenerationOptions {
  maxRetries?: number;
  simplifyPrompt?: boolean;
  isRetry?: boolean;
}

/**
 * Interface for returning landing page generation results with status information
 */
export interface LandingPageGenerationResult {
  landingPage: LandingPageData;
  generationStatus: LandingPageGenerationStatus;
}