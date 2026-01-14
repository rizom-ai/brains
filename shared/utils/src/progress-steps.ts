/**
 * Standard progress step percentages for job handlers.
 * Use these constants instead of hardcoded numbers for consistency.
 */
export const PROGRESS_STEPS = {
  START: 0,
  INIT: 10,
  FETCH: 20,
  PROCESS: 40,
  GENERATE: 50,
  EXTRACT: 60,
  SAVE: 80,
  COMPLETE: 100,
} as const;

export type ProgressStep = (typeof PROGRESS_STEPS)[keyof typeof PROGRESS_STEPS];
