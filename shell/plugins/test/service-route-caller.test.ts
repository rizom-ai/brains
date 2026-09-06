import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineRoute,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  verbatim,
  type InterfaceCaller,
} from "../src";

/** What the route saw, so a test can read the caller off the answer. */
const seenSchema = z.object({
  actorId: z.string(),
  permission: z.string(),
  isAnchor: z.boolean(),
  canonicalId: z.string().optional(),
});

/**
 * A route that reports its caller, secured by an authenticator the test
 * supplies — which is what a console does: it verifies its own session and
 * knows who it verified.
 */
async function callerSeenBy(
  authenticate: () => {
    id: string;
    displayName?: string;
    canonicalId?: string;
    permission?: InterfaceCaller["permission"];
    isAnchor?: boolean;
  } | null,
): Promise<z.output<typeof seenSchema> | number> {
  const definition = defineServicePlugin({
    id: "studio",
    config: z.object({}),
    routes: () => [
      defineRoute({
        method: "GET",
        path: "/studio/api/me",
        security: { kind: "protocol", authenticate },
        response: verbatim,
        handle: ({ caller }) =>
          Response.json({
            actorId: caller.actor.id,
            permission: caller.permission,
            isAnchor: caller.isAnchor,
            ...(caller.actor.canonicalId !== undefined
              ? { canonicalId: caller.actor.canonicalId }
              : {}),
          }),
      }),
    ],
  });

  const harness = createPluginHarness();
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
 * Who a route is talking to.
 *
 * A channel interface knows an id on its own transport and asks the runtime
 * what that id is worth here. A console is the other case: it verified a
 * first-party session and already knows the person's role, so being told to
 * re-derive it from channel grants would answer "public" about the brain's
 * own operator. The authenticator says what it knows; the runtime asks only
 * about what it was not told.
 * Named consumer: @brains/studio.
 */
describe("the caller a declared route is given", () => {
  it("refuses a request its authenticator does not recognise", async () => {
    expect(await callerSeenBy(() => null)).toBe(401);
  });

  it("asks the runtime what an id is worth when the authenticator does not say", async () => {
    const seen = await callerSeenBy(() => ({ id: "someone" }));

    // Nobody granted this id anything on this declaration, so it is public.
    expect(seen).toMatchObject({ actorId: "someone", permission: "public" });
  });

  it("takes the permission the authenticator verified", async () => {
    const seen = await callerSeenBy(() => ({
      id: "operator",
      permission: "admin",
      isAnchor: true,
    }));

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
  it("carries the canonical identity the authenticator resolved", async () => {
    const seen = await callerSeenBy(() => ({
      id: "operator",
      canonicalId: "person-1",
      permission: "admin",
    }));

    expect(seen).toMatchObject({ canonicalId: "person-1" });
  });
});
