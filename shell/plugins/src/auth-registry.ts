import type { AssignableMember } from "@brains/contracts";
import { assignableMembers } from "@brains/contracts";
import type { AuthBackend, IAuthNamespace } from "./contracts/auth";

/** Holds the brain's auth backend for every plugin on one shell. */
export class AuthRegistry implements IAuthNamespace {
  private backend: AuthBackend | undefined;

  get(): AuthBackend | undefined {
    return this.backend;
  }

  bindBackend(backend: AuthBackend): () => void {
    if (this.backend && this.backend !== backend) {
      throw new Error("Auth backend is already bound");
    }
    this.backend = backend;
    let active = true;
    return (): void => {
      if (!active) return;
      active = false;
      if (this.backend === backend) this.backend = undefined;
    };
  }

  async listAssignableMembers(): Promise<AssignableMember[]> {
    return assignableMembers((await this.backend?.listUsers()) ?? []);
  }
}
