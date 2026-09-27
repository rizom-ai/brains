import { AuthService } from "../../src/auth-service";

/** Per-suite ownership; no module mocks or process-global service registry. */
export function createAuthServiceFixture(): {
  AuthService: typeof AuthService;
  closeAuthServices: () => Promise<void>;
} {
  const owners = new Set<AuthService>();
  class OwnedAuthService extends AuthService {
    constructor(...args: ConstructorParameters<typeof AuthService>) {
      super(...args);
      owners.add(this);
    }
  }
  return {
    AuthService: OwnedAuthService,
    closeAuthServices: async (): Promise<void> => {
      const current = [...owners];
      owners.clear();
      const results = await Promise.allSettled(
        current.map((owner) => owner.close()),
      );
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (failures.length)
        throw new AggregateError(failures, "Auth test owners failed to retire");
    },
  };
}
