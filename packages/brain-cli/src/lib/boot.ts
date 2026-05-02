import type { BootMode } from "@brains/core";

/**
 * In-process brain boot.
 *
 * This module is the bridge between the CLI and the runtime.
 * The bootBrain function is set by the build entrypoint via setBootFn().
 *
 * In the monorepo, no boot function is set — start.ts never reaches this code
 * (it delegates to the subprocess runner instead).
 *
 * In the bundled @rizom/brain, the build entrypoint calls setBootFn() with
 * a function that imports @brains/app and boots the brain in-process.
 */

type BootFn = (
  cwd: string,
  modelName: string,
  definition: unknown,
  flags: { chat: boolean; mode?: BootMode },
) => Promise<void>;

let registeredBootFn: BootFn | undefined;

/**
 * Register the boot function. Called by the build entrypoint.
 */
export function setBootFn(fn: BootFn): void {
  registeredBootFn = fn;
}

/**
 * Boot a brain in-process using the registered boot function.
 */
export async function bootBrain(
  cwd: string,
  modelName: string,
  definition: unknown,
  flags: { chat: boolean; mode?: BootMode },
): Promise<void> {
  if (!registeredBootFn) {
    throw new Error(
      "In-process boot not available. Run from the monorepo or install @rizom/brain globally.",
    );
  }
  await registeredBootFn(cwd, modelName, definition, flags);
}

/**
 * Reset the boot function. For testing only.
 */
export function resetBootFn(): void {
  registeredBootFn = undefined;
}
