import type { Plugin } from "@brains/plugins";
import { fixturePlugin } from "./fixture-plugin";

/** Sorts first and is a plugin instance: the export any guess would take. */
export const aFirstPlugin: Plugin = fixturePlugin("first");

/** The export an eval.yaml names. */
export function declaredPlugin(config: Record<string, unknown> = {}): Plugin {
  return fixturePlugin(
    typeof config["suffix"] === "string"
      ? `declared-${config["suffix"]}`
      : "declared",
  );
}
