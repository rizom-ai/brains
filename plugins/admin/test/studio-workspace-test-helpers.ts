import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import type { MockShell } from "@brains/test-utils";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import adminPackage from "../src";
import packageJson from "../package.json";

export const adminActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "admin-user",
  actor: { kind: "user", userId: "admin-user" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

export const trustedActor: StudioWorkspaceActor = {
  ...adminActor,
  userId: "trusted-user",
  actor: { kind: "user", userId: "trusted-user" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

export async function captureAdminWorkspaces(
  shell: MockShell,
): Promise<StudioWorkspaceRegistration[]> {
  const registrations: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      STUDIO_WORKSPACE_REGISTER_MESSAGE,
      async (message) => {
        registrations.push(message.payload);
        return {
          success: true,
          data: {
            workspaceUrl: `/studio/workspaces/${encodeURIComponent(message.payload.id)}`,
          },
        };
      },
    );
  const metadata = { name: packageJson.name, version: packageJson.version };
  bindPluginPackageMetadata(adminPackage, metadata);
  const plugin = instantiatePluginPackageDefinition(
    adminPackage,
    {},
    metadata,
  )[0];
  if (!plugin) throw new Error("Admin plugin was not created");
  await plugin.register(shell);
  await plugin.finalizeRegistration?.();
  return registrations;
}

export function workspaceByLabel(
  registrations: StudioWorkspaceRegistration[],
  label: string,
): StudioWorkspaceRegistration {
  const workspace = registrations.find(
    (registration) => registration.label === label,
  );
  if (!workspace) throw new Error(`Missing ${label} workspace registration`);
  return workspace;
}

export function administrationTab(
  registrations: StudioWorkspaceRegistration[],
  tab: "people" | "invitations" | "audit",
): StudioWorkspaceRegistration {
  const workspace = workspaceByLabel(registrations, "Administration");
  return {
    ...workspace,
    dataProvider: (
      actor,
      query,
      signal,
    ): ReturnType<typeof workspace.dataProvider> => {
      const queryRecord =
        query !== null && typeof query === "object" && !Array.isArray(query)
          ? Object.fromEntries(Object.entries(query))
          : {};
      return workspace.dataProvider(actor, { ...queryRecord, tab }, signal);
    },
  };
}

export function findAction(value: unknown, label: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  if (Reflect.get(value, "label") === label && Reflect.has(value, "actionId")) {
    return value;
  }
  for (const child of Object.values(value)) {
    const result = findAction(child, label);
    if (result !== undefined) return result;
  }
  return undefined;
}

export function actionRequest(
  action: unknown,
  input?: Record<string, unknown>,
  phase?: { mode: "prepare" } | { mode: "execute"; token: string },
): Record<string, unknown> {
  if (action === null || typeof action !== "object") {
    throw new Error("Expected action control");
  }
  const actionId = Reflect.get(action, "actionId");
  if (typeof actionId !== "string") throw new Error("Expected action id");
  return {
    actionId,
    input: input ?? Reflect.get(action, "input"),
    ...(phase?.mode === "prepare"
      ? { mode: "prepare" }
      : phase?.mode === "execute"
        ? { mode: "execute", confirmationToken: phase.token }
        : {}),
  };
}

export function resultField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  const result = Reflect.get(value, "result");
  if (result !== null && typeof result === "object") {
    return Reflect.get(result, key);
  }
  return Reflect.get(value, key);
}
