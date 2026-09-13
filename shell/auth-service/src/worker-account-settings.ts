import {
  AUTH_ACCOUNT_SETTINGS_READ_CHANNEL,
  authAccountSettingsReadRequestSchema,
  authStoredAccountSettingsSchema,
  authConfiguredAccountSettingsSchema,
  type AuthAccountSettingsReadRequest,
} from "@brains/contracts";
import type {
  AccountSettingsBackend,
  ServicePluginContext,
} from "@brains/plugins";

export function registerOwnerAccountSettingsReads(
  context: ServicePluginContext,
  backend: AccountSettingsBackend | undefined,
): () => void {
  return context.messaging.subscribe(
    AUTH_ACCOUNT_SETTINGS_READ_CHANNEL,
    async (message) => {
      const request = authAccountSettingsReadRequestSchema.parse(
        message.payload,
      );
      if (!backend)
        throw new Error(
          "Account settings backend is not configured on the owner",
        );
      const definition = {
        packageName: request.packageName,
        definitionId: request.definitionId,
      };
      return {
        success: true,
        data:
          request.operation === "read"
            ? await backend.read({ ...definition, actorId: request.actorId })
            : await backend.list(definition),
      };
    },
  );
}

/** Workers may read execution credentials; administrative mutations stay on the owner. */
export function createWorkerAccountSettingsBackend(
  context: ServicePluginContext,
): AccountSettingsBackend {
  const request = async (
    payload: AuthAccountSettingsReadRequest,
  ): Promise<unknown> => {
    const response = await context.messaging.send({
      type: AUTH_ACCOUNT_SETTINGS_READ_CHANNEL,
      payload,
    });
    if ("noop" in response || !response.success) {
      throw new Error(
        "noop" in response
          ? "Owner account settings request was not handled"
          : (response.error ?? "Owner account settings request failed"),
      );
    }
    return response.data;
  };
  const rejectMutation = async (): Promise<never> => {
    throw new Error(
      "Account settings mutations require the control-plane owner",
    );
  };
  return {
    read: async (identity) =>
      authStoredAccountSettingsSchema.nullable().parse(
        await request({
          operation: "read",
          packageName: identity.packageName,
          definitionId: identity.definitionId,
          actorId: identity.actorId,
        }),
      ),
    list: async (identity) =>
      authConfiguredAccountSettingsSchema.parse(
        await request({
          operation: "list",
          packageName: identity.packageName,
          definitionId: identity.definitionId,
        }),
      ),
    write: rejectMutation,
    delete: rejectMutation,
    deleteActor: rejectMutation,
  };
}
