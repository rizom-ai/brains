import type { BuildResult } from "../types/site-builder-types";

export interface SuccessfulBuildResultOptions {
  outputDir: string;
  routesBuilt: number;
  warnings: string[];
}

export function createSuccessfulBuildResult(
  options: SuccessfulBuildResultOptions,
): BuildResult {
  return {
    success: true,
    outputDir: options.outputDir,
    filesGenerated: options.routesBuilt + 1,
    routesBuilt: options.routesBuilt,
    ...(options.warnings.length > 0 && { warnings: options.warnings }),
  };
}

export interface FailedBuildResultOptions {
  outputDir: string;
  errorMessage: string;
}

export function createFailedBuildResult(
  options: FailedBuildResultOptions,
): BuildResult {
  return {
    success: false,
    outputDir: options.outputDir,
    filesGenerated: 0,
    routesBuilt: 0,
    errors: [options.errorMessage],
  };
}
