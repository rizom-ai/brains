import { STUDIO_ACCOUNT_WORKSPACE_ID } from "../../src/account-workspace";
import { STUDIO_CHAT_WORKSPACE_ID } from "../../src/chat-workspace";

const COLLECTION_ENTITY_TYPES = new Set([
  "project",
  "projects",
  "series",
  "topic",
  "topics",
]);

export const SITE_ENTITY_TYPES: Set<string> = new Set([
  "profile",
  "settings",
  "site-info",
  "siteInfo",
]);

export const SYSTEM_TYPE_GROUPS = [
  {
    label: "Identity",
    presentation: "form",
    types: ["anchor-profile", "brain-character", "style-guide"],
  },
  {
    label: "Intelligence",
    presentation: "document",
    types: [
      "prompt",
      "prompts",
      "skill",
      "skills",
      "playbook",
      "playbooks",
      "swot",
      "swots",
    ],
  },
  { label: "Network", presentation: "form", types: ["agent", "agents"] },
] as const;

const SYSTEM_ENTITY_TYPES = new Set<string>(
  SYSTEM_TYPE_GROUPS.flatMap((group) => [...group.types]),
);

/**
 * Which part of the Studio a destination belongs to.
 *
 * Kept apart from the navigation that renders it so that the navigation and
 * the hook driving it can both ask, without importing each other.
 */
export type StudioArea =
  "overview" | "chat" | "library" | "work" | "administration" | "system";

export function studioTypeGroup(
  entityType: string,
): "Content" | "Collections" | "Site" | "System" {
  if (SITE_ENTITY_TYPES.has(entityType)) return "Site";
  if (SYSTEM_ENTITY_TYPES.has(entityType)) return "System";
  if (COLLECTION_ENTITY_TYPES.has(entityType)) return "Collections";
  return "Content";
}

export function studioArea(
  entityType: string | null,
  workspaceId: string | null,
): StudioArea | null {
  // Navigation ownership, not renderer selection. Account has no owning rail area.
  if (workspaceId === "studio:overview") return "overview";
  if (workspaceId === STUDIO_CHAT_WORKSPACE_ID) return "chat";
  if (workspaceId === "admin:administration") return "administration";
  if (workspaceId === STUDIO_ACCOUNT_WORKSPACE_ID) return null;
  if (workspaceId) return "work";
  const group = entityType ? studioTypeGroup(entityType) : null;
  return group === "Site" || group === "System" ? "system" : "library";
}
