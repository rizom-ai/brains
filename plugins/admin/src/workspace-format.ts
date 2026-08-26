import type { StudioWorkspaceRegistration } from "@brains/plugins";
import {
  getActiveAuthService,
  type AuthAdminUserSummary,
  type AuthService,
} from "@brains/auth-service";

export type AdminWorkspaceRegistration = Omit<
  StudioWorkspaceRegistration,
  "pluginId"
>;

const workspaceDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function formatWorkspaceDate(timestamp: number): string {
  return workspaceDateFormatter.format(new Date(timestamp));
}

export function requireAuthService(): AuthService {
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
