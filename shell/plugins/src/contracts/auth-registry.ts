import type {
  AuthAudit,
  AuthCaller,
  AuthFederation,
  AuthIdentities,
} from "./auth";
import type { AuthAdministration } from "./auth-administration";

/**
 * Where the running auth implementation is published.
 *
 * One registration per brain: auth-service registers itself when it comes
 * up and withdraws on shutdown, and a package reads what is there. A brain
 * with no auth-service reads `undefined` — which is the honest answer, and
 * the one a module-level global could not give a package that had already
 * imported it.
 */
/** Everything the runtime publishes as one object. */
export type AuthImplementation = AuthCaller &
  AuthAudit &
  AuthFederation &
  AuthIdentities &
  AuthAdministration;

/** Read access for extensions. Installing auth is a runtime responsibility. */
export interface IAuthRegistry {
  getCaller(): AuthCaller | undefined;
  getAudit(): AuthAudit | undefined;
  getFederation(): AuthFederation | undefined;
  getIdentities(): AuthIdentities | undefined;
  /** Named consumer: @brains/admin, which administers rather than consumes. */
  getAdministration(): AuthAdministration | undefined;
}

/** Runtime-only registration authority. */
export interface AuthRegistryHost extends IAuthRegistry {
  register(implementation: AuthImplementation): void;
  unregister(implementation: AuthImplementation): void;
}

function createAuditView(source: AuthAudit): AuthAudit {
  return Object.freeze({
    recordAuditEvent: source.recordAuditEvent.bind(source),
    queryAuditEvents: source.queryAuditEvents.bind(source),
  });
}

/** Project both the registry and its returned capabilities, not the service. */
export function createAuthReader(registry: IAuthRegistry): IAuthRegistry {
  return Object.freeze({
    getCaller: (): AuthCaller | undefined => {
      const source = registry.getCaller();
      return (
        source &&
        Object.freeze({
          resolveSession: source.resolveSession.bind(source),
          resolveBearerGrant: source.resolveBearerGrant.bind(source),
          createAuthLoginResponse: source.createAuthLoginResponse.bind(source),
        })
      );
    },
    getAudit: (): AuthAudit | undefined => {
      const source = registry.getAudit();
      return source && createAuditView(source);
    },
    getFederation: (): AuthFederation | undefined => {
      const source = registry.getFederation();
      return (
        source &&
        Object.freeze({
          getIssuer: source.getIssuer.bind(source),
          getA2APeerTrust: source.getA2APeerTrust.bind(source),
          getA2ASigningKey: source.getA2ASigningKey.bind(source),
          grantA2APeerTrust: source.grantA2APeerTrust.bind(source),
          revokeA2APeerTrust: source.revokeA2APeerTrust.bind(source),
        })
      );
    },
    getIdentities: (): AuthIdentities | undefined => {
      const source = registry.getIdentities();
      return (
        source &&
        Object.freeze({
          resolveIdentityAccess: source.resolveIdentityAccess.bind(source),
        })
      );
    },
    getAdministration: (): AuthAdministration | undefined => {
      const source = registry.getAdministration();
      return (
        source &&
        Object.freeze({
          ...createAuditView(source),
          resolveSession: source.resolveSession.bind(source),
          listUsers: source.listUsers.bind(source),
          listAdminUsers: source.listAdminUsers.bind(source),
          getBrainAnchor: source.getBrainAnchor.bind(source),
          updateUserRole: source.updateUserRole.bind(source),
          updateUserStatus: source.updateUserStatus.bind(source),
          deleteSuspendedUser: source.deleteSuspendedUser.bind(source),
          revokeUserSessionsAndRefreshTokens:
            source.revokeUserSessionsAndRefreshTokens.bind(source),
          createInvitation: source.createInvitation.bind(source),
          cancelInvitation: source.cancelInvitation.bind(source),
          resendInvitation: source.resendInvitation.bind(source),
          confirmManualInvitationDelivery:
            source.confirmManualInvitationDelivery.bind(source),
          listInvitationChannels: source.listInvitationChannels.bind(source),
          inviteExternalPeerPerson:
            source.inviteExternalPeerPerson.bind(source),
          linkExternalPeer: source.linkExternalPeer.bind(source),
          unlinkExternalPeer: source.unlinkExternalPeer.bind(source),
          attachIdentity: source.attachIdentity.bind(source),
          detachIdentity: source.detachIdentity.bind(source),
          revokePasskey: source.revokePasskey.bind(source),
          startPasskeyRegistrationForUser:
            source.startPasskeyRegistrationForUser.bind(source),
        })
      );
    },
  });
}

export class AuthRegistry implements AuthRegistryHost {
  private implementation: AuthImplementation | undefined;

  public static createFresh(): AuthRegistry {
    return new AuthRegistry();
  }

  public register(implementation: AuthImplementation): void {
    if (
      this.implementation !== undefined &&
      this.implementation !== implementation
    ) {
      throw new Error("An auth implementation is already registered");
    }
    this.implementation = implementation;
  }

  public unregister(implementation: AuthImplementation): void {
    if (this.implementation === implementation) {
      this.implementation = undefined;
    }
  }

  public getCaller(): AuthCaller | undefined {
    return this.implementation;
  }

  public getAudit(): AuthAudit | undefined {
    return this.implementation;
  }

  public getFederation(): AuthFederation | undefined {
    return this.implementation;
  }

  public getIdentities(): AuthIdentities | undefined {
    return this.implementation;
  }

  public getAdministration(): AuthAdministration | undefined {
    return this.implementation;
  }
}
