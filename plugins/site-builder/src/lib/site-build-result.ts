import type {
  BuildResult,
  SiteBuildDiagnostic,
} from "../types/site-builder-types";

export interface SuccessfulBuildResultOptions {
  outputDir: string;
  routesBuilt: number;
  warnings: string[];
  diagnostics?: SiteBuildDiagnostic[] | undefined;
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
    ...(options.diagnostics &&
      options.diagnostics.length > 0 && {
        diagnostics: options.diagnostics,
      }),
  };
}

export interface FailedBuildResultOptions {
  outputDir: string;
  errorMessages: string[];
  diagnostics?: SiteBuildDiagnostic[] | undefined;
}

export function createFailedBuildResult(
  options: FailedBuildResultOptions,
): BuildResult {
  return {
    success: false,
    outputDir: options.outputDir,
    filesGenerated: 0,
    routesBuilt: 0,
    errors: options.errorMessages,
    ...(options.diagnostics &&
      options.diagnostics.length > 0 && {
        diagnostics: options.diagnostics,
      }),
  };
}
