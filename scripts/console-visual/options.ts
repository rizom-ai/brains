import path from "node:path";
import {
  studioStudyStateSchema,
  supportsStudioStudyState,
} from "../fixtures/studio-study-state";

export const ROOT = path.resolve(import.meta.dir, "../..");
export const BASELINE_DIR = path.join(ROOT, "test/visual/console/baselines");
export const ARTIFACT_DIR = path.join(ROOT, "test/visual/console/artifacts");
export const UPDATE = process.argv.includes("--update");
export const AUDIT_ACCESSIBILITY = process.argv.includes("--a11y");
export const SURFACE_PREFIX = process.argv
  .find((argument) => argument.startsWith("--surface-prefix="))
  ?.slice("--surface-prefix=".length);
export const STUDY_STATE = studioStudyStateSchema
  .optional()
  .parse(
    process.argv
      .find((arg) => arg.startsWith("--study-state="))
      ?.slice("--study-state=".length),
  );
export const SURFACE_FILTER = process.argv
  .find((argument) => argument.startsWith("--surface="))
  ?.slice("--surface=".length);
if (
  STUDY_STATE &&
  SURFACE_FILTER &&
  !supportsStudioStudyState(SURFACE_FILTER, STUDY_STATE)
)
  throw Error(`Study state ${STUDY_STATE} does not apply to ${SURFACE_FILTER}`);
export const VIEWPORT_FILTER = process.argv
  .find((argument) => argument.startsWith("--viewport="))
  ?.slice("--viewport=".length);
export const CLIMATE_FILTER = process.argv
  .find((argument) => argument.startsWith("--climate="))
  ?.slice("--climate=".length);
export const FIXED_NOW = Date.parse("2026-07-11T16:40:00.000Z");
export const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;
export const CLIMATES = ["instrument", "paper"] as const;
