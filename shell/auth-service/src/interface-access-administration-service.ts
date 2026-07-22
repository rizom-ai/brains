import type { RuntimeInterfacePrincipalState } from "@brains/contracts";
import type { AuthAuditStore } from "./audit-store";
import type {
  AdminInterfacePrincipalGrant,
  InterfacePrincipalStore,
  UpsertAdminInterfacePrincipalGrantInput,
} from "./interface-principal-store";
import type { AuthMutationContext } from "./mutation-context";

export interface InterfaceAccessAdministrationServiceOptions {
  store: InterfacePrincipalStore;
  audit: AuthAuditStore;
  publishState: (state: RuntimeInterfacePrincipalState) => void;
}

export class InterfaceAccessAdministrationService {
  private readonly store: InterfacePrincipalStore;
  private readonly audit: AuthAuditStore;
  private readonly publishState: (
    state: RuntimeInterfacePrincipalState,
  ) => void;

  constructor(options: InterfaceAccessAdministrationServiceOptions) {
    this.store = options.store;
    this.audit = options.audit;
    this.publishState = options.publishState;
  }

  listGrants(): Promise<AdminInterfacePrincipalGrant[]> {
    return this.store.listAdminGrants();
  }

  async upsertGrant(
    input: UpsertAdminInterfacePrincipalGrantInput,
    context: AuthMutationContext = {},
  ): Promise<AdminInterfacePrincipalGrant> {
    const grant = await this.store.upsertAdminGrant(input);
    await this.audit.append({
      ...(context.actorUserId ? { actorUserId: context.actorUserId } : {}),
      action: "auth.interface_grant.upserted",
      targetType: "interface_principal_grant",
      targetId: grant.id,
      metadata: {
        interfaceType: grant.interfaceType,
        permissionLevel: grant.permissionLevel,
        label: grant.label,
      },
    });
    await this.publishCurrentState();
    return grant;
  }

  async revokeGrant(
    grantId: string,
    context: AuthMutationContext = {},
  ): Promise<AdminInterfacePrincipalGrant> {
    const grant = await this.store.revokeAdminGrant(grantId);
    await this.audit.append({
      ...(context.actorUserId ? { actorUserId: context.actorUserId } : {}),
      action: "auth.interface_grant.revoked",
      targetType: "interface_principal_grant",
      targetId: grant.id,
      metadata: {
        interfaceType: grant.interfaceType,
        permissionLevel: grant.permissionLevel,
        label: grant.label,
      },
    });
    await this.publishCurrentState();
    return grant;
  }

  private async publishCurrentState(): Promise<void> {
    this.publishState(await this.store.listActiveState());
  }
}
