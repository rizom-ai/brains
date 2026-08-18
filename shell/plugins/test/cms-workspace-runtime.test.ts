import { describe, expect, it } from "bun:test";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  CMS_WORKSPACE_UNREGISTER_MESSAGE,
  DECLARATIVE_CMS_WORKSPACE_RENDERER,
  defineCmsWorkspace,
  defineServicePlugin,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  safeParseRuntimeCmsOperatorView,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
  type CmsWorkspaceUnregistration,
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

function actor(permission: "public" | "trusted" | "admin"): CmsWorkspaceActor {
  return {
    interfaceType: "cms",
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

const workspace = defineCmsWorkspace({
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

describe("declarative CMS workspace runtime", () => {
  it("registers after setup and validates views and typed actions", async () => {
    let factories = 0;
    const definition = defineServicePlugin({
      id: "reading-operator",
      config: z.object({}),
      setup: () => ({ offset: 4 }),
      cmsWorkspaces: (context) => {
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
      logger: createSilentLogger("declarative-cms-runtime"),
    });
    const registrations: CmsWorkspaceRegistration[] = [];
    const unregistrations: CmsWorkspaceUnregistration[] = [];
    shell
      .getMessageBus()
      .subscribe<CmsWorkspaceRegistration>(
        CMS_WORKSPACE_REGISTER_MESSAGE,
        (message) => {
          registrations.push(message.payload);
          return {
            success: true,
            data: {
              workspaceUrl: `/cms/workspaces/${encodeURIComponent(message.payload.id)}`,
            },
          };
        },
      );
    shell
      .getMessageBus()
      .subscribe<CmsWorkspaceUnregistration>(
        CMS_WORKSPACE_UNREGISTER_MESSAGE,
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
      rendererName: DECLARATIVE_CMS_WORKSPACE_RENDERER,
      priority: 50,
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
      safeParseRuntimeCmsOperatorView(
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

  it("rejects query schemas without an empty/default host state", async () => {
    const requiredQuery = z.object({ selected: z.string() });
    const requiredWorkspace = defineCmsWorkspace({
      id: "required-query",
      label: "Required query",
      permission: "trusted",
      query: requiredQuery,
      data: z.object({ selected: z.string() }),
      actions: [],
      view: () => ({ blocks: [] }),
    });
    const definition = defineServicePlugin({
      id: "required-query-cms",
      config: z.object({}),
      cmsWorkspaces: (context) => [
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
      .subscribe<CmsWorkspaceRegistration>(
        CMS_WORKSPACE_REGISTER_MESSAGE,
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
    const queriedWorkspace = defineCmsWorkspace({
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
      id: "query-cms",
      config: z.object({}),
      cmsWorkspaces: (context) => [
        queriedWorkspace.bind(context, {
          actions: [],
          load: ({ query }) => query.get(querySchema),
        }),
      ],
    });
    const shell = createMockShell();
    let registration: CmsWorkspaceRegistration | undefined;
    shell
      .getMessageBus()
      .subscribe<CmsWorkspaceRegistration>(
        CMS_WORKSPACE_REGISTER_MESSAGE,
        (message) => {
          registration = message.payload;
          return { success: true, data: { workspaceUrl: "/cms/query" } };
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
    const preparedWorkspace = defineCmsWorkspace({
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
      id: "prepared-cms",
      config: z.object({}),
      cmsWorkspaces: (context) => {
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
    let registration: CmsWorkspaceRegistration | undefined;
    shell
      .getMessageBus()
      .subscribe<CmsWorkspaceRegistration>(
        CMS_WORKSPACE_REGISTER_MESSAGE,
        (message) => {
          registration = message.payload;
          return { success: true, data: { workspaceUrl: "/cms/prepared" } };
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

  it("does not bind workspace callbacks when CMS is absent", async () => {
    let factories = 0;
    const definition = defineServicePlugin({
      id: "absent-cms",
      config: z.object({}),
      cmsWorkspaces: (context) => {
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
      logger: createSilentLogger("absent-cms-runtime"),
    });
    const plugin = instantiate(definition);

    await plugin.register(shell);
    await plugin.finalizeRegistration?.();

    expect(factories).toBe(0);
    await plugin.shutdown?.();
  });

  it("rejects duplicate local workspace IDs before host registration", async () => {
    const definition = defineServicePlugin({
      id: "duplicate-cms",
      config: z.object({}),
      cmsWorkspaces: (context) => {
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
      logger: createSilentLogger("duplicate-cms-runtime"),
    });
    let registrations = 0;
    shell
      .getMessageBus()
      .subscribe<CmsWorkspaceRegistration>(
        CMS_WORKSPACE_REGISTER_MESSAGE,
        () => {
          registrations += 1;
          return { success: true, data: { workspaceUrl: "/cms/workspaces/x" } };
        },
      );

    const plugin = instantiate(definition);
    await plugin.register(shell);
    expect(plugin.finalizeRegistration?.()).rejects.toThrow(
      'registers CMS workspace "library" more than once',
    );
    expect(registrations).toBe(0);
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
    const result = safeParseRuntimeCmsOperatorView(
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
    const result = safeParseRuntimeCmsOperatorView(detailView(undefined), {
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

  it("rejects an open detail that matches no row in its master", () => {
    expect(
      safeParseRuntimeCmsOperatorView(
        detailView({ forId: "mail-404", title: "Missing", blocks: [] }),
        { actions: [], permission: "trusted" },
      ),
    ).toMatchObject({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "open", "forId"],
          message: expect.stringContaining("mail-404"),
        },
      ],
    });
  });

  it("rejects a container nested inside an open detail", () => {
    const result = safeParseRuntimeCmsOperatorView(
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
      safeParseRuntimeCmsOperatorView(
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
