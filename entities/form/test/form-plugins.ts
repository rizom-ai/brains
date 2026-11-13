import type { Plugin } from "@brains/plugins";
import { formPlugin } from "../src";

/** The form package's plugins, as the canonical brain installs them. */
export function createFormPlugins(): Plugin[] {
  return [formPlugin()];
}
