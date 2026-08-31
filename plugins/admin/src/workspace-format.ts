import type { StudioWorkspaceRegistration } from "@brains/plugins";
import {
  getActiveAuthService,
  type AuthAdminUserSummary,
  type AuthAdministration,
} from "@brains/auth-service";

export type AdminWorkspaceRegistration = Omit<
  StudioWorkspaceRegistration,
  "pluginId"
>;

export interface AdminWorkspaceSource {
  readonly registration: AdminWorkspaceRegistration;
  readonly actionIds: readonly string[];
}

export function adminWorkspaceSource(
  registration: AdminWorkspaceRegistration,
  actions: readonly { readonly name: string }[],
): AdminWorkspaceSource {
  return {
    registration,
    actionIds: actions.map((action) => action.name),
  };
}

const workspaceDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function formatWorkspaceDate(timestamp: number): string {
  return workspaceDateFormatter.format(new Date(timestamp));
}

export function requireAuthService(): AuthAdministration {
  const authService = getActiveAuthService();
  if (!authService) {
    throw new Error("Administration workspace requires auth-service");
  }
  return authService;
}

export function adminUserOptions(
  users: readonly Pick<
    AuthAdminUserSummary,
    "userId" | "displayName" | "status"
  >[],
): { userId: string; displayName: string }[] {
  return users.flatMap((user) =>
    user.status === "invited"
      ? []
      : [{ userId: user.userId, displayName: user.displayName }],
  );
}

/**
 * Where a person came from, in words an operator recognizes. Local members
 * belong to this brain; a vouching peer reads as its domain rather than the
 * raw identifier, since `did:web` encodes the domain it was issued for.
 * Identifiers with no readable form (`did:plc`, opaque handles) are shown
 * unchanged rather than mangled.
 */
export function peerOriginLabel(peerId: string | undefined): string {
  if (!peerId) return "This brain";
  const webPrefix = "did:web:";
  if (!peerId.startsWith(webPrefix)) return peerId;
  const encoded = peerId.slice(webPrefix.length);
  if (encoded.length === 0) return peerId;
  return encoded.split(":").map(decodeURIComponent).join("/");
}
