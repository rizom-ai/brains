/**
 * Resolve the directory the user invoked the brain CLI from.
 *
 * When `bun run <script>` runs a script defined in a package.json, bun changes
 * the process working directory to the directory of that package.json. The
 * original directory the user was in gets stored in `INIT_CWD`. Most package
 * managers (npm, yarn, pnpm) set this too.
 *
 * The brain CLI needs the user's invocation directory, not the script's
 * package.json directory, so it can find a `brain.yaml` in the right place.
 *
 * Falls back to `process.cwd()` when `INIT_CWD` isn't set (e.g. when invoked
 * directly via `bunx brain` or as a globally-installed binary).
 */
export function getInvocationCwd(): string {
  const initCwd = process.env["INIT_CWD"];
  return initCwd && initCwd.length > 0 ? initCwd : process.cwd();
}
