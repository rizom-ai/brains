import { describe, expect, it } from "bun:test";
import { SdkError, toSdkError } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  studioWorkspaceRegisterContract,
  type Plugin,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../src";

type ServicePackage = Parameters<typeof instantiatePluginPackageDefinition>[0];

interface InstalledWorkspace {
  readonly shell: MockShell;
  readonly plugin: Plugin;
  readonly registration: StudioWorkspaceRegistration;
}

/** Installs a package and returns the one Studio workspace it registers. */
async function installWorkspace(
  definition: ServicePackage,
  shell: MockShell = createMockShell({
    logger: createSilentLogger("workspace-action-call"),
  }),
): Promise<InstalledWorkspace> {
  const registrations: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      studioWorkspaceRegisterContract.name,
      (message) => {
        registrations.push(message.payload);
        return { success: true, data: { workspaceUrl: "/studio/reading" } };
      },
    );
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reading-operator", version: "0.1.0" },
  );
  if (!plugin) throw new Error("No plugin was created");
  await plugin.register(shell);
  await plugin.finalizeRegistration?.();
  const [registration] = registrations;
  if (!registration) throw new Error("No workspace was registered");
  return { shell, plugin, registration };
}

function operator(userId = "usr_operator"): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId,
    actor: { kind: "user", userId },
    userPermissionLevel: "trusted",
    visibilityScope: "shared",
    isAnchor: false,
  };
}

async function act(
  installed: InstalledWorkspace,
  request: object,
  signal?: AbortSignal,
): Promise<unknown> {
  const handler = installed.registration.actionHandler;
  if (!handler) throw new Error("The workspace declares no actions");
  return handler(request, operator(), signal);
}

/** One logger for the shell and every plugin it hands a child to. */
function recordingLogger(): { logger: Logger; logged: () => string } {
  const lines: unknown[] = [];
  const record = (...args: unknown[]): void => {
    lines.push(args);
  };
  const logger: Logger = {
    silly: record,
    verbose: record,
    debug: record,
    info: record,
    warn: record,
    error: record,
    child: (): Logger => logger,
    setUseStderr: (): void => {},
  };
  return {
    logger,
    logged: () =>
      JSON.stringify(lines, (_key, value: unknown) =>
        value instanceof Error
          ? { message: value.message, cause: value.cause }
          : value,
      ),
  };
}

function tokenOf(prepared: unknown): string {
  return z.object({ token: z.string() }).parse(prepared).token;
}

describe("a workspace action's input", () => {
  // The browser sends the schema's input; a callback is handed its output.
  const days = z.object({
    days: z.string().transform((value) => Number(value)),
  });
  const postpone = defineWorkspaceAction({
    name: "postpone",
    label: "Postpone",
    permission: "trusted",
    input: days,
    output: z.object({ days: z.number() }),
  });
  const reschedule = defineWorkspaceAction({
    name: "reschedule",
    label: "Reschedule",
    permission: "trusted",
    confirmation: { kind: "prepared" },
    input: days,
    output: z.object({ days: z.number() }),
  });
  const planner = defineStudioWorkspace({
    id: "planner",
    label: "Planner",
    permission: "trusted",
    data: z.object({}),
    actions: [postpone, reschedule],
    view: () => ({
      blocks: [
        {
          type: "actions",
          items: [
            { action: postpone, input: { days: "7" } },
            { action: reschedule, input: { days: "7" } },
          ],
        },
      ],
    }),
  });

  it("reaches the view as written and each callback once, parsed", async () => {
    const seen: unknown[] = [];
    const installed = await installWorkspace(
      defineServicePlugin(
        { id: "planner", config: z.object({}) },
        {
          studioWorkspaces: (context) => [
            planner.bind(context, {
              load: () => ({}),
              actions: [
                postpone.bind(context, ({ input }) => {
                  seen.push(input.days);
                  return { days: input.days };
                }),
                reschedule.bind(
                  context,
                  ({ input }) => {
                    seen.push(input.days);
                    return { days: input.days };
                  },
                  ({ input }) => {
                    seen.push(input.days);
                    return { summary: `Move by ${input.days}?`, revision: "1" };
                  },
                ),
              ],
            }),
          ],
        },
      ),
    );

    const loaded = await installed.registration.dataProvider(operator(), {});
    expect(loaded).toMatchObject({
      view: {
        blocks: [
          {
            type: "actions",
            items: [
              { actionId: "postpone", input: { days: "7" } },
              { actionId: "reschedule", input: { days: "7" } },
            ],
          },
        ],
      },
    });

    expect(
      await act(installed, { actionId: "postpone", input: { days: "7" } }),
    ).toEqual({ days: 7 });
    const token = tokenOf(
      await act(installed, {
        actionId: "reschedule",
        input: { days: "7" },
        mode: "prepare",
      }),
    );
    expect(
      await act(installed, {
        actionId: "reschedule",
        input: { days: "7" },
        confirmationToken: token,
      }),
    ).toEqual({ days: 7 });
    // postpone; prepare; prepare again on confirm, then execute.
    expect(seen).toEqual([7, 7, 7, 7]);
    await installed.plugin.shutdown?.();
  });

  it("answers with the cancellation when its request goes while it runs", async () => {
    // Each call's own request, which its callback ends mid-call.
    const executing = new AbortController();
    const preparing = new AbortController();
    const left = new Error("The operator left");
    const installed = await installWorkspace(
      defineServicePlugin(
        { id: "planner", config: z.object({}) },
        {
          studioWorkspaces: (context) => [
            planner.bind(context, {
              load: () => ({}),
              actions: [
                postpone.bind(context, ({ input }) => {
                  executing.abort(left);
                  return { days: input.days };
                }),
                reschedule.bind(
                  context,
                  ({ input }) => ({ days: input.days }),
                  () => {
                    preparing.abort(left);
                    return { summary: "Move?", revision: "1" };
                  },
                ),
              ],
            }),
          ],
        },
      ),
    );

    expect(
      act(
        installed,
        { actionId: "postpone", input: { days: "7" } },
        executing.signal,
      ),
    ).rejects.toBe(left);
    expect(
      act(
        installed,
        { actionId: "reschedule", input: { days: "7" }, mode: "prepare" },
        preparing.signal,
      ),
    ).rejects.toBe(left);
    await installed.plugin.shutdown?.();
  });
});

describe("a workspace's failure", () => {
  const SECRET = "the private body of tide-1";
  const plan = defineWorkspaceAction({
    name: "plan",
    label: "Plan",
    permission: "trusted",
    input: z.object({
      outcome: z.enum(["explained", "crash", "malformed", "ok"]),
      days: z.number().int(),
    }),
    output: z.object({ planned: z.boolean() }),
  });
  const confirmPlan = defineWorkspaceAction({
    name: "confirm-plan",
    label: "Confirm plan",
    permission: "trusted",
    confirmation: { kind: "prepared" },
    input: z.object({}),
    output: z.object({ planned: z.boolean() }),
  });
  const failingQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
  });
  const failing = defineStudioWorkspace({
    id: "failing",
    label: "Failing",
    permission: "trusted",
    query: failingQuery,
    data: z.object({ page: z.number() }),
    actions: [plan, confirmPlan],
    view: () => ({ blocks: [] }),
  });

  let loadOutcome: "explained" | "crash" | "malformed" | "ok" = "ok";
  let revision = "1";
  const definition = defineServicePlugin(
    { id: "planner", config: z.object({}) },
    {
      studioWorkspaces: (context) => [
        failing.bind(context, {
          load: ({ query }) => {
            if (loadOutcome === "explained") {
              throw new SdkError("not_found", {
                message: SECRET,
                publicMessage: "No plan for this page",
              });
            }
            if (loadOutcome === "crash") throw new Error(SECRET);
            if (loadOutcome === "malformed") {
              // A loader answering outside its data schema, untyped.
              return JSON.parse(`{"page":"${SECRET}"}`);
            }
            return { page: query.get(failingQuery).page };
          },
          actions: [
            plan.bind(context, ({ input }) => {
              if (input.outcome === "explained") {
                throw new SdkError("conflict", {
                  message: SECRET,
                  publicMessage: "Someone planned it first",
                });
              }
              if (input.outcome === "crash") throw new Error(SECRET);
              if (input.outcome === "malformed") {
                return JSON.parse(`{"planned":"${SECRET}"}`);
              }
              return { planned: true };
            }),
            confirmPlan.bind(
              context,
              () => ({ planned: true }),
              () => ({ summary: "Plan it?", revision }),
            ),
          ],
        }),
      ],
    },
  );

  /** What a failure tells the operator: its public form, nothing else. */
  async function publicFailure(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
      () => {
        throw new Error("Expected a failure");
      },
      (error: unknown) => toSdkError(error).toJSON(),
    );
  }

  async function installFailing(): Promise<{
    installed: InstalledWorkspace;
    logged: () => string;
  }> {
    const { logger, logged } = recordingLogger();
    const installed = await installWorkspace(
      definition,
      createMockShell({ logger }),
    );
    return { installed, logged };
  }

  it("keeps a callback's code and public message, and its diagnostic in the package's log", async () => {
    const { installed, logged } = await installFailing();
    const plan = (outcome: string): Promise<unknown> =>
      publicFailure(
        act(installed, { actionId: "plan", input: { outcome, days: 1 } }),
      );

    expect(await plan("explained")).toEqual({
      code: "conflict",
      message: "Someone planned it first",
    });
    expect(await plan("crash")).toEqual({
      code: "handler_failed",
      message: "The operation failed",
    });
    expect(await plan("malformed")).toEqual({
      code: "invalid_response",
      message: "Invalid response",
    });
    expect(logged()).toContain(SECRET);
    await installed.plugin.shutdown?.();
  });

  it("refuses a request by its code, naming offending input paths", async () => {
    const { installed } = await installFailing();

    expect(
      await publicFailure(
        act(installed, {
          actionId: "plan",
          input: { outcome: "ok", days: "soon" },
        }),
      ),
    ).toEqual({
      code: "invalid_input",
      message: expect.stringContaining("days"),
    });
    expect(
      await publicFailure(act(installed, { actionId: "unplan", input: {} })),
    ).toMatchObject({ code: "not_found" });
    expect(
      await publicFailure(act(installed, { actionId: "plan" })),
    ).toMatchObject({ code: "invalid_input" });
    expect(
      await publicFailure(
        act(installed, {
          actionId: "plan",
          input: { outcome: "ok", days: 1 },
          mode: "prepare",
        }),
      ),
    ).toMatchObject({ code: "invalid_input" });

    const token = tokenOf(
      await act(installed, {
        actionId: "confirm-plan",
        input: {},
        mode: "prepare",
      }),
    );
    revision = "2";
    expect(
      await publicFailure(
        act(installed, {
          actionId: "confirm-plan",
          input: {},
          confirmationToken: token,
        }),
      ),
    ).toEqual({
      code: "conflict",
      message: "The confirmation is no longer current; confirm again",
    });
    revision = "1";
    await installed.plugin.shutdown?.();
  });

  it("loads in the same public form", async () => {
    const { installed, logged } = await installFailing();
    const load = (query: object = {}): Promise<unknown> =>
      publicFailure(installed.registration.dataProvider(operator(), query));

    loadOutcome = "explained";
    expect(await load()).toEqual({
      code: "not_found",
      message: "No plan for this page",
    });
    loadOutcome = "crash";
    expect(await load()).toEqual({
      code: "handler_failed",
      message: "The operation failed",
    });
    loadOutcome = "malformed";
    expect(await load()).toEqual({
      code: "invalid_response",
      message: "Invalid response",
    });
    loadOutcome = "ok";
    expect(await load({ page: "zero" })).toEqual({
      code: "invalid_input",
      message: expect.stringContaining("page"),
    });
    expect(logged()).toContain(SECRET);
    await installed.plugin.shutdown?.();
  });
});
