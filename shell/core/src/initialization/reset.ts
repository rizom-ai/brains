import { Shell } from "../shell";
import { resetServiceSingletons } from "./shellInitializer";

/**
 * Reset the Shell singleton and all service singletons.
 *
 * Lives outside shellInitializer so the initializer never depends on
 * the Shell class (keeps the import graph one-way: shell → initializer).
 */
export async function resetAllSingletons(): Promise<void> {
  await Shell.resetInstance();
  resetServiceSingletons();
}
