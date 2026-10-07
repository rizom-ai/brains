import { expect, test, spyOn } from "bun:test";
import { createPluginHarness } from "../src/test/harness";
import { createStubAuth, createTestPrincipal } from "../src/test/stub-auth";
import { createRuntimeRoute } from "../src/interface/route-runtime";
import { defineRoute, verbatim } from "../src";
import { createAuthReader } from "../src/contracts/auth-registry";
import { assertRouteCaller } from "../src/internal/route-caller-authority";
import type { InterfaceCaller } from "../src/interface/route-contract";

for (const status of ["active", "suspended", "absent"] as const)
  test(`optional session resolves ${status} once across host and SDK reads without anonymous authority`, async () => {
    const harness = createPluginHarness();
    const authority = harness.getMockShell().getAuthRegistry();
    const auth = createStubAuth({
      principal:
        status === "absent"
          ? undefined
          : createTestPrincipal({
              status,
              permissionLevel: "trusted",
              role: "trusted",
            }),
    });
    const resolve = spyOn(auth, "resolveSession");
    authority.register(auth);
    const observed: Array<InterfaceCaller | null> = [];
    const route = createRuntimeRoute(
      defineRoute({
        method: "POST",
        path: "/session",
        security: { kind: "session", optional: true },
        response: verbatim,
        handle: async ({ caller, request }) => {
          observed.push(caller);
          const principal = await createAuthReader(authority)
            .getCaller()
            ?.resolveSession(request);
          expect(resolve).toHaveBeenCalledTimes(1);
          if (caller) {
            assertRouteCaller(caller, authority);
            expect(caller.permission).toBe("trusted");
            if (!principal) throw new Error("Missing resolved principal");
            expect(caller.actor.id).toBe(principal.userId);
          }
          return new Response(caller ? "Ready" : "Forbidden", {
            status: caller ? 200 : 403,
          });
        },
      }),
      {
        declarationId: "session",
        auth: () => authority,
        permissions: { getUserLevel: () => "admin", isAnchor: () => true },
      },
    );
    const response = await route.handler(
      new Request("https://brain.test/session", { method: "POST" }),
    );
    expect(response.status).toBe(status === "active" ? 200 : 403);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(observed).toHaveLength(1);
    const original = observed[0];
    if (original)
      expect(() => assertRouteCaller(original, authority)).toThrow();
    else expect(status).not.toBe("active");
  });
