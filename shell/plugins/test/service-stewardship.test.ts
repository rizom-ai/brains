import { describe, expect, it, spyOn } from "bun:test";
import { SdkError } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineBusContract,
  defineEntity,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
  type ToolContext,
} from "../src";

// The steward: the one package that writes the reader's profile.
const readerProfile = defineEntity({
  type: "reader-profile",
  purpose: "Who the reader is",
  metadata: z.object({
    name: z.string(),
    headline: z.string().optional(),
  }),
});

// The change another package asks the steward for.
const fillProfile = defineBusContract({
  channel: "@fixture/reader-profile:fill",
  request: z.object({ headline: z.string() }),
  response: z.object({ filled: z.boolean() }),
  delivery: "request",
});

const steward = defineServicePlugin(
  {
    id: "profile",
    config: z.object({ importers: z.array(z.string()).default([]) }),
    entities: [readerProfile],
  },
  {
    subscriptions: ({ answer, config, entities }) => [
      answer(fillProfile, async ({ request, sender }) => {
        // The steward decides who may ask, by the package that asked.
        if (!config.importers.includes(sender)) {
          throw new SdkError("permission_denied", {
            publicMessage: `${sender} may not fill the reader profile`,
          });
        }
        const profile = await entities.get(readerProfile, "reader-profile");
        if (!profile) throw new SdkError("not_found");
        if (profile.metadata.headline) return { filled: false };
        await entities.update(readerProfile, profile, {
          metadata: { ...profile.metadata, headline: request.headline },
        });
        return { filled: true };
      }),
    ],
  },
);

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

const importer = defineServicePlugin(
  { id: "reader-import", config: z.object({}) },
  {
    tools: ({ entities, messaging }) => [
      defineTool({
        name: "import",
        description: "Fill the reader profile from an import",
        input: z.object({ headline: z.string() }),
        output: z.object({ status: z.string(), code: z.string().optional() }),
        permission: "public",
        async execute({ input }) {
          const asked = await messaging.request(fillProfile, input);
          if (asked.status === "failed") {
            return { status: asked.status, code: asked.error.code };
          }
          return {
            status:
              asked.status === "answered" && asked.data.filled
                ? "filled"
                : asked.status,
          };
        },
      }),
      defineTool({
        name: "write-directly",
        description: "Refused: writes the stewarded type itself",
        input: z.object({}),
        output: z.object({}),
        permission: "public",
        async execute() {
          const profile = await entities.get(readerProfile, "reader-profile");
          if (!profile) throw new SdkError("not_found");
          // @ts-expect-error Only the steward writes the reader profile.
          await entities.update(readerProfile, profile, {
            metadata: { ...profile.metadata, headline: "Taken over" },
          });
          return {};
        },
      }),
    ],
  },
);

async function install(
  shell: MockShell,
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  packageName: string,
  config: object = {},
): Promise<PluginCapabilities> {
  const plugins = instantiatePluginPackageDefinition(definition, config, {
    name: packageName,
    version: "0.1.0",
  });
  const registered = await plugins.reduce<
    Promise<{ plugin: Plugin; capabilities: PluginCapabilities }[]>
  >(
    async (done, plugin) => [
      ...(await done),
      { plugin, capabilities: await plugin.register(shell) },
    ],
    Promise.resolve([]),
  );
  const service = registered.find(({ plugin }) => plugin.type === "service");
  if (!service) throw new Error(`No service in ${packageName}`);
  return service.capabilities;
}

async function stewardedBrain(
  importers: string[],
): Promise<{ shell: MockShell; importer: PluginCapabilities }> {
  const shell = createMockShell();
  await install(shell, steward, "@fixture/reader-profile", { importers });
  await shell.getEntityService().createEntity({
    entity: {
      id: "reader-profile",
      entityType: readerProfile.type,
      content: "",
      metadata: { name: "Alex" },
      visibility: "public",
    },
  });
  return {
    shell,
    importer: await install(shell, importer, "@fixture/reader-import"),
  };
}

async function call(
  capabilities: PluginCapabilities,
  name: string,
  input: object,
): Promise<unknown> {
  const tool = capabilities.tools.find(
    (candidate) => candidate.name === `reader-import_${name}`,
  );
  if (!tool) throw new Error(`No tool ${name}`);
  return tool.handler(input, admin);
}

describe("a stewarded type", () => {
  it("is changed by asking its steward, which alone writes it", async () => {
    const { shell, importer: tools } = await stewardedBrain([
      // A service asks as its package's plugin: `<package name>:<id>`.
      "@fixture/reader-import:reader-import",
    ]);
    const updated = spyOn(shell.getEntityService(), "updateEntity");

    expect(await call(tools, "import", { headline: "Reads a lot" })).toEqual({
      success: true,
      data: { status: "filled" },
    });
    const profile = await shell.getEntityService().getEntity({
      entityType: readerProfile.type,
      id: "reader-profile",
    });
    expect(profile?.metadata).toMatchObject({ headline: "Reads a lot" });
    // The write is the steward's own.
    expect(updated.mock.calls[0]?.[0].options?.eventContext).toEqual({
      actor: {
        kind: "service",
        serviceId: "@fixture/reader-profile:profile",
      },
    });
  });

  it("is refused to a package its steward does not admit", async () => {
    const { importer: tools } = await stewardedBrain([]);

    expect(await call(tools, "import", { headline: "Reads a lot" })).toEqual({
      success: true,
      data: { status: "failed", code: "permission_denied" },
    });
  });

  it("cannot be written by another package directly", async () => {
    const { shell, importer: tools } = await stewardedBrain([]);

    expect(await call(tools, "write-directly", {})).toMatchObject({
      success: false,
      code: "permission_denied",
    });
    const profile = await shell.getEntityService().getEntity({
      entityType: readerProfile.type,
      id: "reader-profile",
    });
    expect(profile?.metadata).toEqual({ name: "Alex" });
  });

  it("cannot be taken over by another package declaring it too", async () => {
    const shell = createMockShell();
    await install(shell, steward, "@fixture/reader-profile");
    const usurper = defineServicePlugin({
      id: "usurper",
      config: z.object({}),
      entities: [readerProfile],
    });

    expect(install(shell, usurper, "@fixture/usurper")).rejects.toThrow(
      "already registered",
    );
  });
});
