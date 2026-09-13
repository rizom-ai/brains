import type { PluginPackageDefinition } from "@brains/sdk";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";

/** Materialize production declarations through the real runtime, not a parallel view serializer. */
export async function registerFixtureWorkspace(
  shell: MockShell,
  definition: PluginPackageDefinition,
): Promise<StudioWorkspaceRegistration> {
  const registrations: StudioWorkspaceRegistration[] = [];
  const unsubscribe = shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      "studio:register-workspace",
      async ({ payload }) => {
        registrations.push(payload);
        return {
          success: true,
          data: { workspaceUrl: `/studio/workspaces/${payload.id}` },
        };
      },
    );
  const metadata = { name: "@fixtures/studio", version: "0.0.0" };
  try {
    bindPluginPackageMetadata(definition, metadata);
    for (const plugin of instantiatePluginPackageDefinition(
      definition,
      {},
      metadata,
    )) {
      await plugin.register(shell);
      await plugin.finalizeRegistration?.();
    }
  } finally {
    unsubscribe();
  }
  const registration = registrations[0];
  if (registrations.length !== 1 || !registration)
    throw new Error("Fixture must declare exactly one workspace");
  return registration;
}

export function refuseFixtureAction(): never {
  throw new Error("Visual fixtures do not execute workspace actions");
}
