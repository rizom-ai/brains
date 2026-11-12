import type { Plugin, PluginCapabilities } from "@brains/plugins";
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

/** A plugin class, as an entity plugin class is exported: the loader constructs it with eval.yaml's config. */
export class FixturePluginClass implements Plugin {
  readonly id: string;
  readonly version = "0.0.0";
  readonly type = "entity";
  readonly packageName = "@brains/eval-loader-fixture";

  constructor(config: Record<string, unknown> = {}) {
    this.id =
      typeof config["suffix"] === "string"
        ? `class-${config["suffix"]}`
        : "class";
  }

  async register(): Promise<PluginCapabilities> {
    return { tools: [], resources: [] };
  }
}

/** An export that is neither a plugin, a plugin class, nor a factory. */
export const fixtureAdapter = { entityType: "fixture" };
