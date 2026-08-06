export interface CommandResult {
  success: boolean;
  message?: string;
  /** Exact subprocess status for supervisor and runner failures. */
  exitCode?: number;
}
