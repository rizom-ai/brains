import { z } from "@brains/utils/zod";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  type CmsWorkspaceRegistration,
} from "../types/cms-workspace";
import type { ServicePluginContext } from "./context";

const registrationResultSchema = z.object({ workspaceUrl: z.string() });

/**
 * Register a workspace with the first-party CMS, returning its URL, or
 * undefined when no CMS is mounted to answer.
 *
 * Authorisation stays with the caller: workspaces differ in how they gate
 * (a blanket level, or per-entity-action checks), so only the send and the
 * response handling are shared.
 */
export async function registerCmsWorkspace(
  context: Pick<ServicePluginContext, "messaging">,
  registration: CmsWorkspaceRegistration,
): Promise<string | undefined> {
  const response = await context.messaging.send({
    type: CMS_WORKSPACE_REGISTER_MESSAGE,
    payload: registration,
  });
  if (!("success" in response) || !response.success) return undefined;

  const parsed = registrationResultSchema.safeParse(response.data);
  return parsed.success ? parsed.data.workspaceUrl : undefined;
}
