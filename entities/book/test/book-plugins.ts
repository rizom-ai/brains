import type { Plugin } from "@brains/plugins";
import { bookPlugin } from "../src";

/** The book package's plugins, as the canonical brain installs them. */
export function createBookPlugins(): Plugin[] {
  return [bookPlugin()];
}
