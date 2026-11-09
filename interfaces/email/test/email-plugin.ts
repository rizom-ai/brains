import type { Plugin } from "@brains/plugins";
import {
  EmailInterface,
  type EmailConfigInput,
  type EmailInterfaceDependencies,
} from "../src";

/**
 * The Email interface as the brain creates it, with the collaborators a test
 * hands it. The one place the tests name how it is built, so they read the
 * same before and after it is declared.
 */
export function createEmailPlugin(
  config: EmailConfigInput = {},
  dependencies: EmailInterfaceDependencies = {},
): Plugin {
  return new EmailInterface(config, dependencies);
}
