/** Interaction id Studio registers for its mount. */
export const STUDIO_INTERACTION_ID = "studio";

/** Interaction id Studio registers for native chat. */
export const CHAT_INTERACTION_ID = "chat";

/** Studio's built-in Account workspace. */
export const STUDIO_ACCOUNT_WORKSPACE_ID = "studio:account";

/** Account section that shows how to connect AI tools over MCP. */
export const STUDIO_AI_TOOLS_SECTION = "ai-tools";

/** Account section that shows how to mount the brain as a network drive. */
export const STUDIO_DRIVE_SECTION = "drive";

/**
 * Deep link to Account → AI tools, given Studio's mount (the href of the
 * `studio` interaction). Shared so emails can link to it without knowing
 * Studio's routing.
 */
export function studioAiToolsHref(studioHref: string): string {
  const base = studioHref.replace(/\/+$/, "");
  return `${base}/workspaces/${encodeURIComponent(STUDIO_ACCOUNT_WORKSPACE_ID)}?section=${STUDIO_AI_TOOLS_SECTION}`;
}
