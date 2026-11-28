/**
 * The heap eslint may use, in megabytes. Type-aware linting of the largest
 * workspace package reaches Node's default limit of about 4 GB and aborts
 * with "JavaScript heap out of memory" on some runs.
 */
const LINT_HEAP_MB = 8192;

/**
 * NODE_OPTIONS for an eslint run: the caller's own, a heap large enough for
 * the largest package unless the caller set one, and the compat module.
 */
export function lintNodeOptions(
  existing: string | undefined,
  compatLoader: string,
): string {
  const own = existing?.trim();
  return [
    own,
    own?.includes("--max-old-space-size")
      ? undefined
      : `--max-old-space-size=${LINT_HEAP_MB}`,
    `--require=${compatLoader}`,
  ]
    .filter(Boolean)
    .join(" ");
}
