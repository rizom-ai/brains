import type { Plugin } from "@brains/plugins";
import { emailWorkflows } from "../src";

/** The email-workflows package's plugins, as a brain installs them. */
export function createEmailWorkflowsPlugins(): Plugin[] {
  return emailWorkflows();
}
