import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import { STUDIO_ACCOUNT_WORKSPACE_ID } from "../../src/account-workspace";

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

/** Presentation refinements only; registration metadata owns classification. */
export const SYSTEM_TYPE_GROUPS = [
  {
    label: "Structure",
    presentation: "form",
    types: ["grouping-definitions"],
  },
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

/**
 * Which of Studio's fixed sections a destination belongs to.
 *
 * Kept apart from the navigation that renders it so that the navigation and
 * the hook driving it can both ask, without importing each other.
 */
export type StudioArea = StudioWorkspaceInfo["section"];

export function studioTypeGroup(
  type: Pick<EntityTypeInfo, "entityType" | "classification">,
): "Content" | "Collections" | "Site" | "System" {
  if (type.classification === "system")
    return SITE_ENTITY_TYPES.has(type.entityType) ? "Site" : "System";
  if (COLLECTION_ENTITY_TYPES.has(type.entityType)) return "Collections";
  return "Content";
}

export function studioArea(
  entityType: Pick<EntityTypeInfo, "entityType" | "classification"> | null,
  workspace: Pick<StudioWorkspaceInfo, "id" | "section"> | null,
): StudioArea | null {
  // A workspace names its section. Account is reached from the account menu.
  if (workspace)
    return workspace.id === STUDIO_ACCOUNT_WORKSPACE_ID
      ? null
      : workspace.section;
  return entityType?.classification === "system" ? "brain" : "library";
}
