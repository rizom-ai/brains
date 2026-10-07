import { expect, test } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineStudioWorkspace,
  defineWorkspaceAction,
  defineEntityCatalog,
} from "../src";
import { createBuiltInStudioWorkspaceRegistration } from "../src/operator/studio-workspace-runtime";
import { createStudioWorkspaceActor } from "../src/operator/workspace-actor";
import {
  issueRouteCaller,
  revokeRouteCaller,
} from "../src/internal/route-caller-authority";
import { createMockServicePluginContext } from "../src/test/mock-service-plugin-context";
import type { InterfaceCaller } from "../src/interface/route-contract";
import type {
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "../src/types/studio-workspace";

const claims: InterfaceCaller = {
  actor: { id: "session" },
  permission: "admin",
  isAnchor: false,
};
const action = defineWorkspaceAction({
  name: "refresh",
  label: "Refresh",
  input: z.object({}),
  output: z.object({}),
});
const definition = defineStudioWorkspace({
  id: "lifetime",
  entityCatalog: defineEntityCatalog({ id: "notes", label: "Notes" }),
  label: "Lifetime",
  permission: "trusted",
  data: z.object({}),
  actions: [action],
  badge: () => 1,
  view: () => ({ blocks: [] }),
});

test("workspace admission refuses an unissued administrator even without custom authorization", async () => {
  const context = createMockServicePluginContext();
  const registration = createBuiltInStudioWorkspaceRegistration({
    context,
    definition,
    bind: (binding) =>
      definition.bind(binding, {
        actions: [action.bind(binding, () => ({}))],
        load: () => ({}),
        listEntityTypes: () => ["note"],
      }),
  });
  expect(
    await Promise.resolve(
      registration.accessHandler(createStudioWorkspaceActor(claims)),
    ).catch((error: unknown) => error),
  ).toMatchObject({ code: "unauthenticated" });
  const caller = issueRouteCaller(claims, context.auth);
  expect(
    await registration.accessHandler(createStudioWorkspaceActor(caller)),
  ).toBe(true);
  revokeRouteCaller(caller);
  expect(
    await Promise.resolve(
      registration.accessHandler(createStudioWorkspaceActor(caller)),
    ).catch((error: unknown) => error),
  ).toMatchObject({ code: "unauthenticated" });
});

const kinds = ["access", "types", "data", "badge", "action"] as const;
type Kind = (typeof kinds)[number];
async function invoke(
  registration: Omit<StudioWorkspaceRegistration, "pluginId">,
  actor: StudioWorkspaceActor,
  kind: Kind,
): Promise<unknown> {
  switch (kind) {
    case "access":
      return registration.accessHandler(actor);
    case "types":
      if (typeof registration.entityTypes !== "function")
        throw new Error("Expected dynamic entity types");
      return registration.entityTypes(actor);
    case "data":
      return registration.dataProvider(actor);
    case "badge":
      if (!registration.badgeProvider)
        throw new Error("Expected badge provider");
      return registration.badgeProvider(actor);
    case "action":
      if (!registration.actionHandler)
        throw new Error("Expected action handler");
      return registration.actionHandler(
        { actionId: "refresh", input: {} },
        actor,
      );
  }
}

test.each([...kinds])(
  "%s callbacks inherit request revocation and cannot return late results",
  async (kind) => {
    const context = createMockServicePluginContext();
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let callbackSignal: AbortSignal | undefined;
    async function wait(signal: AbortSignal): Promise<void> {
      callbackSignal = signal;
      entered.resolve();
      await finish.promise;
    }
    const registration = createBuiltInStudioWorkspaceRegistration({
      context,
      definition,
      bind: (binding) =>
        definition.bind(binding, {
          ...(kind === "access"
            ? {
                authorize: async ({
                  signal,
                }: {
                  signal: AbortSignal;
                }): Promise<boolean> => {
                  await wait(signal);
                  return true;
                },
              }
            : {}),
          actions: [
            action.bind(binding, async ({ signal }) => {
              await wait(signal);
              return {};
            }),
          ],
          load: async ({ signal }) => {
            await wait(signal);
            return {};
          },
          listEntityTypes: async ({ signal }) => {
            await wait(signal);
            return ["note"];
          },
        }),
    });
    const caller = issueRouteCaller(claims, context.auth);
    const pending = invoke(
      registration,
      createStudioWorkspaceActor(caller),
      kind,
    );
    await entered.promise;
    expect(callbackSignal?.aborted).toBe(false);
    revokeRouteCaller(caller);
    expect(callbackSignal?.aborted).toBe(true);
    finish.resolve();
    expect(await pending.catch((error: unknown) => error)).toMatchObject({
      name: "AbortError",
    });
  },
);
