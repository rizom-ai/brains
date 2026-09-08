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

/** Do not hand the host object itself to an author callback. */
export function createAuthReader(registry: IAuthRegistry): IAuthRegistry {
  return {
    getCaller: () => registry.getCaller(),
    getAudit: () => registry.getAudit(),
    getFederation: () => registry.getFederation(),
    getIdentities: () => registry.getIdentities(),
    getAdministration: () => registry.getAdministration(),
  };
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
