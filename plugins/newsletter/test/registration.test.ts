import { describe, expect, it } from "bun:test";
import {
  SYSTEM_CHANNELS,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import type { NewsletterCompositeConfigInput } from "../src";
import { createNewsletterPlugins } from "./newsletter-plugins";

const buttondown: NewsletterCompositeConfigInput = {
  provider: { type: "buttondown", apiKey: "buttondown-key" },
};
const resend: NewsletterCompositeConfigInput = {
  provider: {
    type: "resend",
    apiKey: "resend-key",
    segmentId: "segment-1",
    from: "Rizom <newsletter@example.com>",
  },
  autoSendOnPublish: true,
};

/** The channels the package answers or hears, by the name the bus routes. */
const channels = [
  "generate:execute",
  "publish:completed",
  "plugin:site-builder:slots",
  SYSTEM_CHANNELS.pluginsRegistered,
] as const;

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  handlers: Record<string, number>;
}

async function installed(
  config: NewsletterCompositeConfigInput = {},
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const plugins = createNewsletterPlugins(config);
  const capabilities = await registerAll(shell, plugins, options);
  const handlers = Object.fromEntries(
    channels.map((channel) => [
      channel,
      shell.getMessageBus().getHandlerCount(channel),
    ]),
  );
  return { shell, plugins, capabilities, handlers };
}

const subscriberTools = [
  {
    name: "newsletter_subscribers",
    visibility: "admin",
    sideEffects: "external",
    cli: undefined,
    input: ["action", "email", "name", "tags", "type", "limit"],
  },
  {
    name: "newsletter_signup",
    visibility: "public",
    sideEffects: "external",
    cli: undefined,
    input: ["email", "name"],
  },
];

function tools(capabilities: PluginCapabilities[]): unknown[] {
  return capabilities.flatMap((capability) =>
    capability.tools.map((tool) => ({
      name: tool.name,
      visibility: tool.visibility,
      sideEffects: tool.sideEffects,
      cli: tool.cli,
      input: Object.keys(tool.inputSchema),
    })),
  );
}

/**
 * What the newsletter package registers, pinned as its newsletter entity
 * plugin class and its Buttondown and Resend service classes registered
 * it: sites render its issues through its templates and data source, the
 * content pipeline schedules and publishes issues through it, brains call
 * its subscriber tools, and a site's signup form posts to its route.
 */
describe("the newsletter package's registered surface", () => {
  it("is the newsletter entity, and the configured provider's service beside it", async () => {
    const plain = await installed();
    const withButtondown = await installed(buttondown);
    const withResend = await installed(resend);
    const ids = ({ plugins }: Installed): unknown[] =>
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]);

    expect(ids(plain)).toEqual([
      ["newsletter", "entity", "@brains/newsletter", []],
    ]);
    expect(ids(withButtondown)).toEqual([
      ["newsletter", "entity", "@brains/newsletter", []],
      ["buttondown", "service", "@brains/newsletter", []],
    ]);
    expect(ids(withResend)).toEqual([
      ["newsletter", "entity", "@brains/newsletter", []],
      ["resend", "service", "@brains/newsletter", []],
    ]);
  });

  it("registers the newsletter type, its templates, data source and generation", async () => {
    const { shell, capabilities } = await installed();
    expect(
      shell.getEntityRegistry().getEntityTypeConfig("newsletter"),
    ).toMatchObject({
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
      retiredFields: ["buttondownId", "resendBroadcastId"],
    });
    expect(
      [...shell.getTemplates().keys()].filter((name) =>
        name.startsWith("newsletter:"),
      ),
    ).toEqual([
      "newsletter:generation",
      "newsletter:newsletter-list",
      "newsletter:newsletter-detail",
    ]);
    expect(shell.getDataSourceRegistry().get("newsletter:entities")?.name).toBe(
      "Newsletter Entity DataSource",
    );
    expect(
      shell.getJobQueueService().getHandler("newsletter:generation"),
    ).toBeDefined();
    expect(tools(capabilities)).toEqual([]);
  });

  it("offers the subscriber tools and the signup route only with a provider", async () => {
    const plain = await installed();
    for (const config of [buttondown, resend]) {
      const { plugins, capabilities } = await installed(config);
      expect(tools(capabilities)).toEqual(subscriberTools);
      expect(plugins.map((plugin) => plugin.getApiRoutes?.() ?? [])).toEqual([
        [],
        [
          {
            path: "/subscribe",
            method: "POST",
            tool: "newsletter_signup",
            public: true,
            successRedirect: "/subscribe/thanks",
            errorRedirect: "/subscribe/error",
          },
        ],
      ]);
    }
    expect(
      plain.plugins.map((plugin) => plugin.getApiRoutes?.() ?? []),
    ).toEqual([[]]);
  });

  it("answers and hears its channels as the classes did, in the main process and in a worker", async () => {
    expect((await installed()).handlers).toEqual({
      "generate:execute": 1,
      "publish:completed": 0,
      "plugin:site-builder:slots": 0,
      [SYSTEM_CHANNELS.pluginsRegistered]: 0,
    });
    expect((await installed(buttondown)).handlers).toEqual({
      "generate:execute": 1,
      "publish:completed": 0,
      "plugin:site-builder:slots": 1,
      [SYSTEM_CHANNELS.pluginsRegistered]: 1,
    });
    // Auto-send hears every published post.
    expect((await installed(resend)).handlers).toEqual({
      "generate:execute": 1,
      "publish:completed": 1,
      "plugin:site-builder:slots": 1,
      [SYSTEM_CHANNELS.pluginsRegistered]: 1,
    });
    // A worker answers the site's signup slot as it renders, and nothing else.
    expect((await installed(resend, { executionOnly: true })).handlers).toEqual(
      {
        "generate:execute": 0,
        "publish:completed": 0,
        "plugin:site-builder:slots": 1,
        [SYSTEM_CHANNELS.pluginsRegistered]: 0,
      },
    );
  });
});
