import type {
  RuntimeOperatorActionControl,
  RuntimeStudioOperatorView,
  RuntimeStudioOperatorViewStatus,
  UserPermissionLevel,
} from "@brains/plugins";
import type { StudioWorkspaceInfo } from "./api";

type StudioHeadTotal = Extract<
  RuntimeStudioOperatorView["blocks"][number],
  { readonly type: "stats" }
>["items"][number];

export type StudioAccessRequirement =
  | { readonly kind: "session"; readonly label: "Signed in" }
  | {
      readonly kind: "permission";
      readonly label: "Trusted" | "Admin only";
    };

export interface StudioPageHeadModel {
  readonly kicker?: string | undefined;
  readonly access: StudioAccessRequirement;
  readonly title: string;
  readonly description?: string | undefined;
  readonly status?: RuntimeStudioOperatorViewStatus | undefined;
  readonly totals: readonly StudioHeadTotal[];
  readonly primaryAction?: RuntimeOperatorActionControl | undefined;
}

export function studioAccessRequirement(
  permission: UserPermissionLevel,
): StudioAccessRequirement {
  switch (permission) {
    case "public":
      return { kind: "session", label: "Signed in" };
    case "trusted":
      return { kind: "permission", label: "Trusted" };
    case "admin":
      return { kind: "permission", label: "Admin only" };
  }
}

/**
 * Normalizes the current declarative view without removing or rewriting any
 * blocks. Phase 2 can render this model after every fixed surface has an
 * equivalent adapter.
 */
export function declarativeStudioPageHead(
  workspace: StudioWorkspaceInfo,
  view: RuntimeStudioOperatorView,
): StudioPageHeadModel {
  const leadingBlock = view.blocks[0];
  const totals = leadingBlock?.type === "stats" ? leadingBlock.items : [];

  return {
    ...(view.kicker ? { kicker: view.kicker } : {}),
    access: studioAccessRequirement(workspace.permission),
    title: view.title ?? workspace.label,
    ...(view.description ? { description: view.description } : {}),
    ...(view.status ? { status: view.status } : {}),
    totals,
    ...(view.primaryAction ? { primaryAction: view.primaryAction } : {}),
  };
}
