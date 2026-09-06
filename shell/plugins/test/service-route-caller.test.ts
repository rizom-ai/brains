import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { createStubAuth, createTestPrincipal } from "../src/test/stub-auth";
import {
  defineRoute,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  verbatim,
  type RouteSecurity,
} from "../src";

/** What the route saw, so a test can read the caller off the answer. */
const seenSchema = z.object({
  actorId: z.string(),
  permission: z.string(),
  isAnchor: z.boolean(),
  canonicalId: z.string().optional(),
});

/**
 * A route that reports its caller, under whichever security the test
 * declares, on a brain whose auth service knows whoever the test signs in.
 */
async function callerSeenBy(
  security: RouteSecurity,
  signedIn?: ReturnType<typeof createTestPrincipal>,
): Promise<z.output<typeof seenSchema> | number> {
  const definition = defineServicePlugin({
    id: "studio",
    config: z.object({}),
    routes: () => [
      defineRoute({
        method: "GET",
        path: "/studio/api/me",
        security,
        response: verbatim,
        handle: ({ caller }) =>
          Response.json(
            caller
              ? {
                  actorId: caller.actor.id,
                  permission: caller.permission,
                  isAnchor: caller.isAnchor,
                  ...(caller.actor.canonicalId !== undefined
                    ? { canonicalId: caller.actor.canonicalId }
                    : {}),
                }
              : null,
          ),
      }),
    ],
  });

  const harness = createPluginHarness();
  harness
    .getMockShell()
    .getAuthRegistry()
    .register(createStubAuth({ principal: signedIn }));
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/studio", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Studio plugin was not created");
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();

  const route = (plugin.getWebRoutes?.() ?? [])[0];
  if (!route) throw new Error("The route was not registered");
  const response = await route.handler(
    new Request("http://brain.test/studio/api/me"),
  );
  if (response.status !== 200) return response.status;
  return seenSchema.parse(await response.json());
}

/**
 * Who a route is talking to, and who decides.
 *
 * A channel interface knows an id on its own transport and asks the runtime
 * what that id is worth here. A console is the other case: the person is
 * signed in to the brain itself, and the brain's own auth service is the
 * authority on their role. In neither case does the package's code decide a
 * permission level — the route says how the caller authenticates, and the
 * runtime says what they are worth.
 * Named consumer: @brains/studio.
 */
describe("the caller a declared route is given", () => {
  it("refuses a protocol request its authenticator does not recognise", async () => {
    expect(
      await callerSeenBy({ kind: "protocol", authenticate: () => null }),
    ).toBe(401);
  });

  it("asks the runtime what a protocol id is worth here", async () => {
    const seen = await callerSeenBy({
      kind: "protocol",
      authenticate: () => ({ id: "someone" }),
    });

    // Nobody granted this id anything on this declaration, so it is public.
    expect(seen).toMatchObject({ actorId: "someone", permission: "public" });
  });

  it("refuses a session route when nobody is signed in", async () => {
    expect(await callerSeenBy({ kind: "session" })).toBe(401);
  });

  it("refuses a session that is not active", async () => {
    expect(
      await callerSeenBy(
        { kind: "session" },
        createTestPrincipal({ status: "suspended" }),
      ),
    ).toBe(401);
  });

  /**
   * The brain's own operator, signed in with a passkey. Their role lives in
   * the brain's user store, not in per-interface grants — which would have
   * answered "public" about the person who owns the brain.
   */
  it("gives a session route the person the brain signed in", async () => {
    const seen = await callerSeenBy(
      { kind: "session" },
      createTestPrincipal({
        userId: "operator",
        permissionLevel: "admin",
        isAnchor: true,
      }),
    );

    expect(seen).toMatchObject({
      actorId: "operator",
      permission: "admin",
      isAnchor: true,
    });
  });

  /**
   * One person reaches the brain over several identities. A write made in
   * the console is the same person as one made in chat, and attribution
   * only says so if the caller carries the link.
   */
  it("carries the person behind the session", async () => {
    const seen = await callerSeenBy(
      { kind: "session" },
      createTestPrincipal({ userId: "operator", canonicalId: "person-1" }),
    );

    expect(seen).toMatchObject({ canonicalId: "person-1" });
  });
});
