import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  safeParseRuntimeStudioOperatorView,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../src";
import { createMockShell } from "../src/test/mock-shell";

const actor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "reader",
  actor: { kind: "user", userId: "reader" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

describe("workspace action wire inputs", () => {
  it("rejects non-JSON wire values and non-JSON parsed values in views", () => {
    const fromDate = defineWorkspaceAction({
      name: "from-date",
      label: "From date",
      input: z.date().transform((value) => value.toISOString()),
      output: z.string(),
    });
    const toDate = defineWorkspaceAction({
      name: "to-date",
      label: "To date",
      input: z.string().transform((value) => new Date(value)),
      output: z.string(),
    });
    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [
            { type: "action", action: fromDate, input: new Date("2026-01-01") },
          ],
        },
        { actions: [fromDate], permission: "trusted" },
      ).success,
    ).toBe(false);
    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [{ type: "action", action: toDate, input: "2026-01-01" }],
        },
        { actions: [toDate], permission: "trusted" },
      ).success,
    ).toBe(false);
  });

  for (const rendered of [false, true]) {
    for (const prepared of [false, true]) {
      it(`parses once per admitted request (${rendered ? "rendered" : "direct"}, ${prepared ? "prepared" : "immediate"})`, async () => {
        let parses = 0;
        const seen: unknown[] = [];
        const input = z.object({
          id: z.string().transform((value) => `parsed:${value}`),
          amount: z.string().transform((value) => {
            parses += 1;
            return Number(value);
          }),
          label: z.string().default("default label"),
        });
        const action = defineWorkspaceAction({
          name: "save",
          label: "Save",
          input,
          output: z.object({
            id: z.string(),
            amount: z.number(),
            label: z.string(),
          }),
          ...(prepared ? { confirmation: { kind: "prepared" as const } } : {}),
        });
        const wireInput = { id: "entry", amount: "2.50" };
        const workspace = defineStudioWorkspace({
          id: "inputs",
          label: "Inputs",
          permission: "trusted",
          data: z.object({}),
          actions: [action],
          view: () => ({
            blocks: [{ type: "action", action, input: wireInput }],
          }),
        });
        const definition = defineServicePlugin(
          { id: "input-test", config: z.object({}) },
          {
            studioWorkspaces: (context) => [
              workspace.bind(context, {
                load: () => ({}),
                actions: [
                  action.bind(
                    context,
                    ({ input }) => {
                      seen.push({ execute: input });
                      return input;
                    },
                    ({ input }) => {
                      seen.push({ prepare: input });
                      return {
                        summary: `Save ${input.id} for ${input.amount}`,
                        revision: "one",
                      };
                    },
                  ),
                ],
              }),
            ],
          },
        );
        const shell = createMockShell();
        const registrations: StudioWorkspaceRegistration[] = [];
        shell
          .getMessageBus()
          .subscribe<StudioWorkspaceRegistration>(
            STUDIO_WORKSPACE_REGISTER_MESSAGE,
            (message) => {
              registrations.push(message.payload);
              return {
                success: true,
                data: { workspaceUrl: "/studio/inputs" },
              };
            },
          );
        const [plugin] = instantiatePluginPackageDefinition(
          definition,
          {},
          { name: "@fixture/action-input", version: "1.0.0" },
        );
        if (!plugin) throw new Error("Missing plugin");
        try {
          await plugin.register(shell);
          await plugin.finalizeRegistration?.();
          const registration = registrations[0];
          if (!registration?.actionHandler)
            throw new Error("Missing workspace");
          const act = registration.actionHandler;
          let supplied: unknown = wireInput;
          if (rendered) {
            const data = await registration.dataProvider(
              actor,
              {},
              new AbortController().signal,
            );
            const view = z
              .object({
                view: z.object({
                  blocks: z.array(z.object({ input: z.unknown() })),
                }),
              })
              .parse(data);
            supplied = view.view.blocks[0]?.input;
            expect(supplied).toEqual(wireInput);
            expect(wireInput).toEqual({ id: "entry", amount: "2.50" });
          }
          parses = 0;
          let confirmationToken: string | undefined;
          if (prepared) {
            const response = await act(
              { actionId: "save", input: supplied, mode: "prepare" },
              actor,
            );
            confirmationToken = z
              .object({
                token: z.string(),
                summary: z.literal("Save parsed:entry for 2.5"),
              })
              .parse(response).token;
            expect(parses).toBe(1);
            parses = 0;
          }
          expect(
            await act(
              {
                actionId: "save",
                input: supplied,
                ...(confirmationToken ? { confirmationToken } : {}),
              },
              actor,
            ),
          ).toEqual({
            id: "parsed:entry",
            amount: 2.5,
            label: "default label",
          });
          expect(parses).toBe(1);
          const expected = {
            id: "parsed:entry",
            amount: 2.5,
            label: "default label",
          };
          expect(seen).toEqual(
            prepared
              ? [
                  { prepare: expected },
                  { prepare: expected },
                  { execute: expected },
                ]
              : [{ execute: expected }],
          );
          const beforeInvalid = seen.length;
          const invalid = await act(
            { actionId: "save", input: { id: "entry", amount: 2.5 } },
            actor,
          ).catch((error: unknown) => error);
          expect(invalid).toBeInstanceOf(Error);
          expect(seen).toHaveLength(beforeInvalid);
        } finally {
          await plugin.shutdown?.();
        }
      });
    }
  }
});
