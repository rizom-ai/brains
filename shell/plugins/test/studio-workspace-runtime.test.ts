import { describe, expect, it } from "bun:test";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  defineStudioWorkspace,
  defineServicePlugin,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  safeParseRuntimeStudioOperatorView,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
  type StudioWorkspaceUnregistration,
} from "../src";

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reading-operator", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Service plugin was not created");
  return plugin;
}

function actor(
  permission: "public" | "trusted" | "admin",
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: `actor-${permission}`,
    actor: { kind: "user", userId: `actor-${permission}` },
    userPermissionLevel: permission,
    visibilityScope:
      permission === "public"
        ? "public"
        : permission === "trusted"
          ? "shared"
          : "restricted",
    isAnchor: permission === "admin",
  };
}

const refresh = defineWorkspaceAction({
  name: "refresh",
  label: "Refresh",
  permission: "trusted",
  input: z.object({ id: z.string() }),
  output: z.object({ refreshed: z.string() }),
});

const workspace = defineStudioWorkspace({
  id: "library",
  label: "Library",
  permission: "trusted",
  data: z.object({ count: z.number() }),
  actions: [refresh],
  view: ({ data }) => ({
    title: `${data.count} saved`,
    blocks: [
      {
        type: "stats",
        items: [{ label: "Saved", value: data.count }],
      },
      {
        type: "table",
        id: "saved",
        empty: "Nothing saved.",
        columns: [{ key: "title", label: "Title" }],
        rows: [
          {
            id: "saved",
            cells: { title: "Saved item" },
            actions: [{ action: refresh, input: { id: "saved" } }],
          },
        ],
      },
    ],
  }),
});

describe("declarative Studio workspace runtime", () => {
  it("registers after setup and validates views and typed actions", async () => {
    let factories = 0;
    const definition = defineServicePlugin({
      id: "reading-operator",
      config: z.object({}),
      setup: () => ({ offset: 4 }),
      studioWorkspaces: (context) => {
        factories += 1;
        const action = refresh.bind(context, ({ input, state }) => ({
          refreshed: `${input.id}:${state.offset}`,
        }));
        return [
          workspace.bind(context, {
            actions: [action],
            load: ({ state }) => ({ count: state.offset }),
          }),
        ];
      },
    });
    const shell = createMockShell({
      logger: createSilentLogger("declarative-studio-runtime"),
    });
    const registrations: StudioWorkspaceRegistration[] = [];
    const unregistrations: StudioWorkspaceUnregistration[] = [];
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        (message) => {
          registrations.push(message.payload);
          return {
            success: true,
            data: {
              workspaceUrl: `/studio/workspaces/${encodeURIComponent(message.payload.id)}`,
            },
          };
        },
      );
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceUnregistration>(
        STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
        (message) => {
          unregistrations.push(message.payload);
          return { success: true };
        },
      );

    const plugin = instantiate(definition);
    await plugin.register(shell);
    expect(factories).toBe(0);
    await plugin.finalizeRegistration?.();

    expect(factories).toBe(1);
    expect(registrations).toHaveLength(1);
    const registration = registrations[0];
    if (!registration) throw new Error("Workspace was not registered");
    expect(registration).toMatchObject({
      label: "Library",
      rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
      priority: 50,
      permission: "trusted",
      entityTypes: [],
    });
    expect(registration.id).toEndWith(":library");
    expect(await registration.accessHandler(actor("public"))).toBeFalse();
    expect(await registration.accessHandler(actor("trusted"))).toBeTrue();

    expect(
      await registration.dataProvider(
        actor("trusted"),
        {},
        new AbortController().signal,
      ),
    ).toEqual({
      view: {
        title: "4 saved",
        blocks: [
          {
            type: "stats",
            items: [{ label: "Saved", value: 4 }],
          },
          {
            type: "table",
            id: "saved",
            empty: "Nothing saved.",
            columns: [{ key: "title", label: "Title" }],
            rows: [
              {
                id: "saved",
                cells: { title: "Saved item" },
                actions: [
                  {
                    actionId: "refresh",
                    label: "Refresh",
                    input: { id: "saved" },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(
      await registration.actionHandler?.(
        { actionId: "refresh", input: { id: "saved" } },
        actor("trusted"),
        new AbortController().signal,
      ),
    ).toEqual({ refreshed: "saved:4" });
    expect(
      registration.actionHandler?.(
        { actionId: "refresh", input: { id: 4 } },
        actor("trusted"),
      ),
    ).rejects.toThrow('action "refresh" received invalid input');

    await plugin.shutdown?.();
    expect(unregistrations).toEqual([
      {
        pluginId: registration.pluginId,
        workspaceId: registration.id,
      },
    ]);
  });

  it("rejects host-normalized links from author workspace views", () => {
    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [
            {
              type: "list",
              id: "forged-links",
              empty: "No links.",
              items: [
                {
                  id: "forged",
                  title: "Forged",
                  link: {
                    kind: "entity",
                    entityType: "private-record",
                    id: "forged",
                  },
                },
              ],
            },
          ],
        },
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "items", 0, "link"],
          message: expect.stringContaining("normalized host target"),
        },
      ],
    });
  });

  it("rejects host-normalized links nested in columns and cards", () => {
    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [
            {
              type: "columns",
              id: "forged-layout",
              primary: [
                {
                  type: "card",
                  id: "forged-card",
                  label: "Forged card",
                  blocks: [
                    {
                      type: "links",
                      id: "forged-links",
                      items: [
                        {
                          label: "Forged",
                          target: {
                            kind: "entity",
                            entityType: "private-record",
                            id: "forged",
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
              aside: [],
            },
          ],
        },
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "primary", 0, "blocks", 0, "items", 0, "target"],
          message: expect.stringContaining("normalized host target"),
        },
      ],
    });
  });

  it("rejects query schemas without an empty/default host state", async () => {
    const requiredQuery = z.object({ selected: z.string() });
    const requiredWorkspace = defineStudioWorkspace({
      id: "required-query",
      label: "Required query",
      permission: "trusted",
      query: requiredQuery,
      data: z.object({ selected: z.string() }),
      actions: [],
      view: () => ({ blocks: [] }),
    });
    const definition = defineServicePlugin({
      id: "required-query-studio",
      config: z.object({}),
      studioWorkspaces: (context) => [
        requiredWorkspace.bind(context, {
          actions: [],
          load: ({ query }) => query.get(requiredQuery),
        }),
      ],
    });
    const shell = createMockShell();
    let registrations = 0;
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        () => {
          registrations += 1;
          return { success: true };
        },
      );
    const plugin = instantiate(definition);
    await plugin.register(shell);

    expect(plugin.finalizeRegistration?.()).rejects.toThrow(
      "query schema without a valid empty/default state",
    );
    expect(registrations).toBe(0);
    await plugin.shutdown?.();
  });

  it("validates typed query state before loading workspace data", async () => {
    const querySchema = z.object({
      source: z.string().default("all"),
      offset: z.coerce.number().int().nonnegative().default(0),
    });
    const queriedWorkspace = defineStudioWorkspace({
      id: "queried",
      label: "Queried",
      permission: "trusted",
      query: querySchema,
      data: z.object({ source: z.string(), offset: z.number() }),
      actions: [],
      view: ({ data }) => ({
        blocks: [
          {
            type: "key-values",
            items: [
              { label: "Source", value: data.source },
              { label: "Offset", value: data.offset },
            ],
          },
        ],
      }),
    });
    const definition = defineServicePlugin({
      id: "query-studio",
      config: z.object({}),
      studioWorkspaces: (context) => [
        queriedWorkspace.bind(context, {
          actions: [],
          load: ({ query }) => query.get(querySchema),
        }),
      ],
    });
    const shell = createMockShell();
    let registration: StudioWorkspaceRegistration | undefined;
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        (message) => {
          registration = message.payload;
          return { success: true, data: { workspaceUrl: "/studio/query" } };
        },
      );
    const plugin = instantiate(definition);
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();
    if (!registration) throw new Error("Query workspace was not registered");

    expect(registration.urlQuery).toBeTrue();
    expect(
      await registration.dataProvider(actor("trusted"), {
        source: "mail",
        offset: "2",
      }),
    ).toMatchObject({
      view: {
        blocks: [
          {
            type: "key-values",
            items: [
              { label: "Source", value: "mail" },
              { label: "Offset", value: 2 },
            ],
          },
        ],
      },
    });
    expect(
      registration.dataProvider(actor("trusted"), { offset: "bad" }),
    ).rejects.toThrow("invalid query state");
    await plugin.shutdown?.();
  });

  it("binds prepared confirmations to caller, action, input, revision, expiry, and one use", async () => {
    const preparedAction = defineWorkspaceAction({
      name: "publish",
      label: "Publish",
      permission: "trusted",
      confirmation: { kind: "prepared" },
      input: z.object({ id: z.string() }),
      output: z.object({ completed: z.string() }),
    });
    const alternateAction = defineWorkspaceAction({
      name: "alternate",
      label: "Alternate",
      permission: "trusted",
      confirmation: { kind: "prepared" },
      input: z.object({ id: z.string() }),
      output: z.object({ completed: z.string() }),
    });
    const preparedWorkspace = defineStudioWorkspace({
      id: "prepared",
      label: "Prepared",
      permission: "trusted",
      data: z.object({}),
      actions: [preparedAction, alternateAction],
      view: () => ({ blocks: [] }),
    });
    let revision = "revision-1";
    let executions = 0;
    const definition = defineServicePlugin({
      id: "prepared-studio",
      config: z.object({}),
      studioWorkspaces: (context) => {
        const execute = ({
          input,
        }: {
          input: { id: string };
        }): { completed: string } => {
          executions += 1;
          return { completed: input.id };
        };
        const prepare = ({
          input,
        }: {
          input: { id: string };
        }): { summary: string; revision: string } => ({
          summary: `Publish ${input.id}?`,
          revision,
        });
        return [
          preparedWorkspace.bind(context, {
            actions: [
              preparedAction.bind(context, execute, prepare),
              alternateAction.bind(context, execute, prepare),
            ],
            load: () => ({}),
          }),
        ];
      },
    });
    const shell = createMockShell();
    let registration: StudioWorkspaceRegistration | undefined;
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        (message) => {
          registration = message.payload;
          return { success: true, data: { workspaceUrl: "/studio/prepared" } };
        },
      );
    const plugin = instantiate(definition);
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();
    if (!registration?.actionHandler) {
      throw new Error("Prepared workspace was not registered");
    }
    const act = registration.actionHandler;
    const prepare = async (id: string): Promise<string> => {
      const response = await act(
        { actionId: "publish", input: { id }, mode: "prepare" },
        actor("trusted"),
      );
      if (
        typeof response !== "object" ||
        response === null ||
        !("token" in response) ||
        typeof response.token !== "string"
      ) {
        throw new Error("Prepared token was not returned");
      }
      return response.token;
    };

    const callerToken = await prepare("one");
    expect(
      act(
        {
          actionId: "publish",
          input: { id: "one" },
          confirmationToken: callerToken,
        },
        actor("admin"),
      ),
    ).rejects.toThrow("invalid or stale");

    const actionToken = await prepare("one");
    expect(
      act(
        {
          actionId: "alternate",
          input: { id: "one" },
          confirmationToken: actionToken,
        },
        actor("trusted"),
      ),
    ).rejects.toThrow("invalid or stale");

    const inputToken = await prepare("one");
    expect(
      act(
        {
          actionId: "publish",
          input: { id: "two" },
          confirmationToken: inputToken,
        },
        actor("trusted"),
      ),
    ).rejects.toThrow("invalid or stale");

    const revisionToken = await prepare("one");
    revision = "revision-2";
    expect(
      act(
        {
          actionId: "publish",
          input: { id: "one" },
          confirmationToken: revisionToken,
        },
        actor("trusted"),
      ),
    ).rejects.toThrow("invalid or stale");

    const originalNow = Date.now;
    let now = originalNow();
    Date.now = (): number => now;
    try {
      const expiredToken = await prepare("one");
      now += 6 * 60 * 1_000;
      expect(
        act(
          {
            actionId: "publish",
            input: { id: "one" },
            confirmationToken: expiredToken,
          },
          actor("trusted"),
        ),
      ).rejects.toThrow("invalid or stale");
    } finally {
      Date.now = originalNow;
    }

    const successToken = await prepare("one");
    expect(
      await act(
        {
          actionId: "publish",
          input: { id: "one" },
          confirmationToken: successToken,
        },
        actor("trusted"),
      ),
    ).toEqual({ completed: "one" });
    expect(
      act(
        {
          actionId: "publish",
          input: { id: "one" },
          confirmationToken: successToken,
        },
        actor("trusted"),
      ),
    ).rejects.toThrow("invalid or stale");
    expect(executions).toBe(1);

    const oldestToken = await prepare("bounded-oldest");
    for (let index = 0; index < 1_000; index += 1) {
      await prepare(`bounded-${index}`);
    }
    expect(
      act(
        {
          actionId: "publish",
          input: { id: "bounded-oldest" },
          confirmationToken: oldestToken,
        },
        actor("trusted"),
      ),
    ).rejects.toThrow("invalid or stale");

    await plugin.shutdown?.();
  });

  it("does not bind workspace callbacks when Studio is absent", async () => {
    let factories = 0;
    const definition = defineServicePlugin({
      id: "absent-studio",
      config: z.object({}),
      studioWorkspaces: (context) => {
        factories += 1;
        const action = refresh.bind(context, ({ input }) => ({
          refreshed: input.id,
        }));
        return [
          workspace.bind(context, {
            actions: [action],
            load: () => ({ count: 0 }),
          }),
        ];
      },
    });
    const shell = createMockShell({
      logger: createSilentLogger("absent-studio-runtime"),
    });
    const plugin = instantiate(definition);

    await plugin.register(shell);
    await plugin.finalizeRegistration?.();

    expect(factories).toBe(0);
    await plugin.shutdown?.();
  });

  it("rejects duplicate local workspace IDs before host registration", async () => {
    const definition = defineServicePlugin({
      id: "duplicate-studio",
      config: z.object({}),
      studioWorkspaces: (context) => {
        const action = refresh.bind(context, ({ input }) => ({
          refreshed: input.id,
        }));
        return [
          workspace.bind(context, {
            actions: [action],
            load: () => ({ count: 0 }),
          }),
          workspace.bind(context, {
            actions: [action],
            load: () => ({ count: 0 }),
          }),
        ];
      },
    });
    const shell = createMockShell({
      logger: createSilentLogger("duplicate-studio-runtime"),
    });
    let registrations = 0;
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration>(
        STUDIO_WORKSPACE_REGISTER_MESSAGE,
        () => {
          registrations += 1;
          return {
            success: true,
            data: { workspaceUrl: "/studio/workspaces/x" },
          };
        },
      );

    const plugin = instantiate(definition);
    await plugin.register(shell);
    expect(plugin.finalizeRegistration?.()).rejects.toThrow(
      'registers Studio workspace "library" more than once',
    );
    expect(registrations).toBe(0);
  });
});

describe("Studio interface semantics", () => {
  it("normalizes one primary action and collection-owned compact table data", () => {
    const result = safeParseRuntimeStudioOperatorView(
      {
        title: "People",
        primaryAction: {
          action: refresh,
          input: { id: "all" },
        },
        blocks: [
          {
            type: "table",
            id: "people",
            empty: "No people.",
            query: {
              controls: [
                {
                  key: "status",
                  label: "Status",
                  value: "active",
                  allLabel: "All statuses",
                  options: [
                    { value: "active", label: "Active", count: 2 },
                    { value: "suspended", label: "Suspended", count: 1 },
                  ],
                },
              ],
              pagination: {
                offset: 0,
                limit: 25,
                total: 3,
                label: "people",
              },
            },
            columns: [
              { key: "person", label: "Person" },
              { key: "role", label: "Role" },
            ],
            rows: [
              {
                id: "person-1",
                cells: { person: "Mira Reyes", role: "Admin" },
                compact: {
                  title: "Mira Reyes",
                  metadata: ["Admin", "Active", "2 passkeys"],
                  badges: [{ label: "this brain", tone: "neutral" }],
                  tone: "good",
                },
              },
            ],
          },
        ],
      },
      { actions: [refresh], permission: "trusted" },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        title: "People",
        primaryAction: {
          actionId: "refresh",
          label: "Refresh",
          input: { id: "all" },
        },
        blocks: [
          {
            type: "table",
            query: {
              controls: [{ key: "status", value: "active" }],
              pagination: { offset: 0, limit: 25, total: 3, label: "people" },
            },
            rows: [
              {
                id: "person-1",
                compact: {
                  title: "Mira Reyes",
                  metadata: ["Admin", "Active", "2 passkeys"],
                  badges: [{ label: "this brain", tone: "neutral" }],
                  tone: "good",
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects ambiguous primary actions and malformed compact rows", () => {
    expect(
      safeParseRuntimeStudioOperatorView(
        {
          primaryAction: [
            { action: refresh, input: { id: "first" } },
            { action: refresh, input: { id: "second" } },
          ],
          blocks: [],
        },
        { actions: [refresh], permission: "trusted" },
      ),
    ).toMatchObject({
      success: false,
      issues: [{ path: ["primaryAction"] }],
    });

    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [
            {
              type: "table",
              id: "people",
              empty: "No people.",
              columns: [{ key: "person", label: "Person" }],
              rows: [
                {
                  id: "person-1",
                  cells: { person: "Mira Reyes" },
                  compact: { title: "" },
                },
              ],
            },
          ],
        },
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: false,
      issues: [{ path: ["blocks", 0, "rows", 0, "compact", "title"] }],
    });

    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [
            {
              type: "table",
              id: "people",
              empty: "No people.",
              query: {
                controls: [
                  { key: "status", label: "Status", options: [] },
                  { key: "status", label: "State", options: [] },
                ],
              },
              columns: [{ key: "person", label: "Person" }],
              rows: [],
            },
          ],
        },
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: false,
      issues: [{ path: ["blocks", 0, "query", "controls", 1, "key"] }],
    });
  });
});

describe("workspace action forms and results", () => {
  const invite = defineWorkspaceAction({
    name: "invite",
    label: "Invite person",
    permission: "admin",
    input: z.object({
      idempotencyKey: z.string(),
      displayName: z.string(),
      deliveryToken: z.string(),
      role: z.enum(["admin", "trusted"]),
    }),
    output: z.object({
      status: z.string(),
      setupUrl: z.url().optional(),
    }),
  });

  it("normalizes bounded form fields and result presentation", () => {
    const result = safeParseRuntimeStudioOperatorView(
      {
        blocks: [
          {
            type: "action",
            action: invite,
            input: { idempotencyKey: "request-1" },
            form: {
              submitLabel: "Create invitation",
              fields: {
                displayName: { label: "Display name", control: "text" },
                deliveryToken: {
                  label: "Delivery token",
                  control: "text",
                  secret: true,
                },
                role: {
                  label: "Role",
                  control: "select",
                  options: [
                    { value: "admin", label: "Admin" },
                    { value: "trusted", label: "Trusted" },
                  ],
                },
              },
            },
            result: {
              title: "Invitation setup",
              fields: {
                status: { label: "Status" },
                setupUrl: {
                  label: "Single-use setup URL",
                  sensitive: true,
                  copyable: true,
                },
              },
            },
          },
        ],
      },
      { actions: [invite], permission: "admin" },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        blocks: [
          {
            type: "action",
            input: { idempotencyKey: "request-1" },
            form: {
              submitLabel: "Create invitation",
              fields: [
                { name: "displayName", required: true, control: "text" },
                {
                  name: "deliveryToken",
                  required: true,
                  control: "text",
                  secret: true,
                },
                { name: "role", required: true, control: "select" },
              ],
            },
            result: {
              title: "Invitation setup",
              fields: [
                { name: "status", label: "Status" },
                {
                  name: "setupUrl",
                  sensitive: true,
                  copyable: true,
                },
              ],
            },
          },
        ],
      },
    });
  });

  it("normalizes disclosure presentation and selected-field labels", () => {
    const deliver = defineWorkspaceAction({
      name: "deliver",
      label: "Deliver invitation",
      permission: "admin",
      input: z.object({
        deliveryType: z.enum(["email", "discord"]),
        deliverySubject: z.string(),
      }),
      output: z.object({ status: z.string() }),
    });
    const result = safeParseRuntimeStudioOperatorView(
      {
        blocks: [
          {
            type: "action",
            action: deliver,
            form: {
              presentation: "disclosure",
              fields: {
                deliveryType: {
                  label: "Delivery channel",
                  control: "select",
                  options: [
                    { value: "email", label: "Email" },
                    { value: "discord", label: "Discord" },
                  ],
                },
                deliverySubject: {
                  label: "Delivery destination",
                  labelBy: {
                    field: "deliveryType",
                    values: [
                      { value: "email", label: "Email address" },
                      { value: "discord", label: "Discord user ID" },
                    ],
                  },
                  control: "text",
                },
              },
            },
          },
        ],
      },
      { actions: [deliver], permission: "admin" },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        blocks: [
          {
            form: {
              presentation: "disclosure",
              fields: [
                { name: "deliveryType" },
                {
                  name: "deliverySubject",
                  labelBy: {
                    field: "deliveryType",
                    values: [
                      { value: "email", label: "Email address" },
                      { value: "discord", label: "Discord user ID" },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    });
  });

  it("rejects incomplete form and result declarations", () => {
    const result = safeParseRuntimeStudioOperatorView(
      {
        blocks: [
          {
            type: "action",
            action: invite,
            input: {
              idempotencyKey: "request-1",
              deliveryToken: "must-not-echo",
            },
            form: {
              fields: {
                deliveryToken: {
                  label: "Delivery token",
                  control: "text",
                  secret: true,
                },
                role: {
                  label: "Role",
                  control: "select",
                  options: [
                    { value: "admin", label: "Admin" },
                    { value: "trusted", label: "Trusted" },
                  ],
                },
              },
            },
            result: {
              title: "Invitation setup",
              fields: {
                setupUrl: {
                  label: "Single-use setup URL",
                  sensitive: true,
                },
              },
            },
          },
        ],
      },
      { actions: [invite], permission: "admin" },
    );

    expect(result).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        {
          path: ["blocks", 0, "form", "fields", "displayName"],
          message: expect.stringContaining("no form declaration"),
        },
        {
          path: ["blocks", 0, "input", "deliveryToken"],
          message: expect.stringContaining("cannot be pre-bound"),
        },
        {
          path: ["blocks", 0, "result", "fields", "status"],
          message: expect.stringContaining("no result declaration"),
        },
        {
          path: ["blocks", 0, "result", "fields", "setupUrl", "copyable"],
          message: expect.stringContaining("explicitly copyable"),
        },
      ]),
    });
  });
});

describe("operator tabs composition", () => {
  it("normalizes query-backed tabs with full workspace sections", () => {
    const result = safeParseRuntimeStudioOperatorView(
      {
        blocks: [
          {
            type: "tabs",
            id: "administration-tabs",
            label: "Administration sections",
            defaultTab: "people",
            queryKey: "tab",
            tabs: [
              {
                id: "people",
                label: "People",
                blocks: [
                  {
                    type: "card",
                    id: "anchor",
                    label: "Brain Anchor",
                    blocks: [
                      {
                        type: "key-values",
                        items: [{ label: "Name", value: "Mira" }],
                      },
                    ],
                  },
                ],
              },
              {
                id: "audit",
                label: "Audit",
                blocks: [
                  {
                    type: "detail",
                    id: "audit-detail",
                    queryKey: "selected",
                    empty: "Select an event.",
                    master: {
                      type: "table",
                      id: "audit-events",
                      empty: "No events.",
                      columns: [{ key: "event", label: "Event" }],
                      rows: [],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      { actions: [], permission: "admin" },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        blocks: [
          {
            type: "tabs",
            queryKey: "tab",
            tabs: [
              { id: "people", blocks: [{ type: "card" }] },
              { id: "audit", blocks: [{ type: "detail" }] },
            ],
          },
        ],
      },
    });
  });
});

describe("operator detail composition", () => {
  const masterList = {
    type: "list" as const,
    id: "inbox-items",
    empty: "Nothing needs attention.",
    items: [
      {
        id: "mail-1",
        title: "Collaboration request",
        link: { detail: { itemId: "mail-1" } },
        // A master row reaches its detail through the same links array that
        // carries its other typed links.
        links: [
          { label: "Read original", target: { detail: { itemId: "mail-1" } } },
        ],
      },
      { id: "mail-2", title: "Invoice awaiting approval" },
    ],
  };

  function detailView(
    open: unknown,
    master: unknown = masterList,
  ): Record<string, unknown> {
    return {
      blocks: [
        {
          type: "detail",
          id: "inbox",
          queryKey: "selected",
          empty: "Select an item to read it.",
          master,
          ...(open === undefined ? {} : { open }),
        },
      ],
    };
  }

  it("carries the open item and its panels beside the master collection", () => {
    const result = safeParseRuntimeStudioOperatorView(
      detailView({
        forId: "mail-1",
        title: "Collaboration request",
        blocks: [
          { type: "text", id: "original", text: "The original message body." },
        ],
      }),
      { actions: [], permission: "trusted" },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        blocks: [
          {
            type: "detail",
            id: "inbox",
            master: { type: "list", id: "inbox-items" },
            open: { forId: "mail-1", title: "Collaboration request" },
          },
        ],
      },
    });
  });

  it("normalizes an author detail link into a host detail target", () => {
    const result = safeParseRuntimeStudioOperatorView(detailView(undefined), {
      actions: [],
      permission: "trusted",
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        blocks: [
          {
            master: {
              items: [
                { id: "mail-1", link: { kind: "detail", itemId: "mail-1" } },
                { id: "mail-2" },
              ],
            },
          },
        ],
      },
    });
  });

  it("keeps the open detail when its row is outside the current page", () => {
    // Paging or filtering can move the selected row out of the master. Losing
    // the reading pane because the operator turned a page would be worse than
    // leaving the list unmarked.
    expect(
      safeParseRuntimeStudioOperatorView(
        detailView({ forId: "mail-404", title: "Off page", blocks: [] }),
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: true,
      data: { blocks: [{ open: { forId: "mail-404", title: "Off page" } }] },
    });
  });

  it("rejects a container nested inside an open detail", () => {
    const result = safeParseRuntimeStudioOperatorView(
      detailView({
        forId: "mail-1",
        title: "Collaboration request",
        blocks: [
          {
            type: "detail",
            id: "nested",
            queryKey: "nested-selected",
            empty: "No selection.",
            master: masterList,
          },
        ],
      }),
      { actions: [], permission: "trusted" },
    );

    expect(result.success).toBe(false);
  });

  it("rejects a detail link outside a detail master", () => {
    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [
            {
              type: "list",
              id: "loose",
              empty: "No items.",
              items: [
                {
                  id: "loose-1",
                  title: "Loose item",
                  link: { detail: { itemId: "loose-1" } },
                },
              ],
            },
          ],
        },
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "items", 0, "link"],
          message: expect.stringContaining("detail"),
        },
      ],
    });
  });
});

describe("operator columns composition", () => {
  it("normalizes a top-level card from the public view-block union", () => {
    expect(
      safeParseRuntimeStudioOperatorView(
        {
          blocks: [
            {
              type: "card",
              id: "standing-facts",
              label: "Standing facts",
              blocks: [
                {
                  type: "key-values",
                  id: "facts",
                  items: [{ label: "State", value: "ready" }],
                },
              ],
            },
          ],
        },
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: true,
      data: {
        blocks: [
          {
            type: "card",
            id: "standing-facts",
            blocks: [{ type: "key-values", id: "facts" }],
          },
        ],
      },
    });
  });

  it("normalizes a primary/aside split into typed regions", () => {
    const result = safeParseRuntimeStudioOperatorView(
      {
        kicker: "Durability operations",
        title: "Content sync",
        blocks: [
          {
            type: "columns",
            id: "sync-body",
            primary: [
              { type: "list", id: "runs", empty: "No runs.", items: [] },
            ],
            aside: [
              {
                type: "card",
                id: "automation",
                label: "Automation",
                blocks: [
                  {
                    type: "key-values",
                    id: "automation-kv",
                    items: [{ label: "File watcher", value: "On" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      { actions: [], permission: "trusted" },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        kicker: "Durability operations",
        blocks: [
          {
            type: "columns",
            primary: [{ type: "list", id: "runs" }],
            aside: [{ type: "card", id: "automation", label: "Automation" }],
          },
        ],
      },
    });
  });

  it("rejects a container nested inside a column region", () => {
    const result = safeParseRuntimeStudioOperatorView(
      {
        blocks: [
          {
            type: "columns",
            id: "outer",
            primary: [{ type: "columns", id: "inner", primary: [], aside: [] }],
            aside: [],
          },
        ],
      },
      { actions: [], permission: "trusted" },
    );
    expect(result.success).toBe(false);
  });
});
