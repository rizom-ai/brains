import { describe, expect, it } from "bun:test";
import { parseInstanceOverrides, resolve } from "@brains/app";
import rover from "../src";

interface WebRouteProvider {
  getWebRoutes(): Array<{
    path: string;
    handler: (request: Request) => Promise<Response> | Response;
  }>;
}

function getWebRouteProvider(plugin: unknown): WebRouteProvider | undefined {
  if (typeof plugin !== "object" || plugin === null) return undefined;
  if (!("getWebRoutes" in plugin)) return undefined;
  return typeof plugin.getWebRoutes === "function"
    ? (plugin as WebRouteProvider)
    : undefined;
}

describe("rover presets", () => {
  it("includes ATProto in the core preset", () => {
    const config = resolve(rover, {}, { preset: "core" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("atproto");
  });

  it("registers Rover's professional profile extension in every preset", () => {
    for (const preset of ["core", "default", "full"] as const) {
      const config = resolve(rover, {}, { preset });
      const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

      expect(pluginIds).toContain("rover-profile");
    }
  });

  it("includes inert LinkedIn profile import in every preset", () => {
    for (const preset of ["core", "default", "full"] as const) {
      const config = resolve(rover, {}, { preset });
      const linkedinImport = config.plugins?.find(
        (plugin) => plugin.id === "linkedin-import",
      );

      expect(linkedinImport).toBeDefined();
      expect(linkedinImport?.config).not.toHaveProperty("accessToken");
    }
  });

  it("does not derive LinkedIn import config from model-owned env names", () => {
    const config = resolve(
      rover,
      {
        LINKEDIN_ACCESS_TOKEN: "legacy-token",
        LINKEDIN_DIRECT_CLIENT_ID: "legacy-client",
        LINKEDIN_DIRECT_CLIENT_SECRET: "legacy-secret",
        LINKEDIN_DIRECT_REDIRECT_URI:
          "https://brain.example/linkedin/oauth/direct/callback",
      },
      { preset: "core" },
    );
    const linkedinImport = config.plugins?.find(
      (plugin) => plugin.id === "linkedin-import",
    );

    expect(linkedinImport?.config).not.toHaveProperty("accessToken");
    expect(linkedinImport?.config).not.toHaveProperty("oauth");
  });

  it("configures LinkedIn import through instance-owned plugin config", () => {
    process.env["OWNER_PORTABILITY_TOKEN"] = "linkedin-token";
    try {
      const overrides = parseInstanceOverrides(`brain: rover
preset: core
plugins:
  linkedin-import:
    accessToken: \${OWNER_PORTABILITY_TOKEN}
`);
      const config = resolve(rover, {}, overrides);
      const linkedinImport = config.plugins?.find(
        (plugin) => plugin.id === "linkedin-import",
      );

      expect(linkedinImport?.config).toMatchObject({
        accessToken: "linkedin-token",
      });
    } finally {
      delete process.env["OWNER_PORTABILITY_TOKEN"];
    }
  });

  it("wires direct OAuth from instance config without model-owned env names", () => {
    process.env["SELF_HOSTED_LINKEDIN_SECRET"] = "client-secret";
    try {
      const overrides = parseInstanceOverrides(`brain: rover
preset: core
plugins:
  linkedin-import:
    oauth:
      mode: direct
      clientId: client-id
      clientSecret: \${SELF_HOSTED_LINKEDIN_SECRET}
      redirectUri: https://brain.example/linkedin/oauth/direct/callback
`);
      const config = resolve(rover, {}, overrides);
      const linkedinImport = config.plugins?.find(
        (plugin) => plugin.id === "linkedin-import",
      );
      const routeProvider = getWebRouteProvider(linkedinImport);

      expect(linkedinImport?.config).toMatchObject({
        oauth: {
          mode: "direct",
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUri: "https://brain.example/linkedin/oauth/direct/callback",
        },
      });
      expect(routeProvider?.getWebRoutes().map((route) => route.path)).toEqual([
        "/linkedin/admin/status",
        "/linkedin/admin/connect",
        "/linkedin/oauth/direct/callback",
        "/linkedin/admin/disconnect",
      ]);
    } finally {
      delete process.env["SELF_HOSTED_LINKEDIN_SECRET"];
    }
  });

  it("keeps site-content opt-in for hosted custom site packages", () => {
    const defaultConfig = resolve(rover, {}, { preset: "default" });
    const defaultPluginIds =
      defaultConfig.plugins?.map((plugin) => plugin.id) ?? [];

    expect(defaultPluginIds).not.toContain("site-content");

    const config = resolve(
      rover,
      {},
      { preset: "default", add: ["site-content"] },
    );
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("site-content");
  });

  it("keeps the ATProto registry opt-in for canonical protocol hosts", () => {
    const defaultConfig = resolve(rover, {}, { preset: "default" });
    const defaultPluginIds =
      defaultConfig.plugins?.map((plugin) => plugin.id) ?? [];

    expect(defaultPluginIds).not.toContain("atproto-registry");

    const config = resolve(
      rover,
      {},
      { preset: "default", add: ["atproto-registry"] },
    );
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("atproto-registry");
  });

  it("merges ATProto identifier from brain config with app password from env", async () => {
    const overrides = parseInstanceOverrides(`brain: rover
domain: smoke.rizom.ai
preset: core
plugins:
  atproto:
    identifier: rizom-test.bsky.social
`);
    const config = resolve(
      rover,
      { ATPROTO_APP_PASSWORD: "app-password" },
      overrides,
    );
    const atproto = getWebRouteProvider(
      config.plugins?.find((plugin) => plugin.id === "atproto"),
    );
    const didRoute = atproto
      ?.getWebRoutes()
      .find((route) => route.path === "/.well-known/did.json");

    const response = await didRoute?.handler(
      new Request("https://smoke.rizom.ai/.well-known/did.json"),
    );

    expect(await response?.json()).toMatchObject({
      id: "did:web:smoke.rizom.ai",
      alsoKnownAs: ["at://rizom-test.bsky.social"],
    });
  });

  it("distinguishes draft blog posts from adjacent draft publishing entities", () => {
    const config = resolve(rover, {}, { preset: "full" });

    expect(config.agentInstructions?.join("\n")).toContain(
      "Draft blog posts are only post entities with status draft",
    );
    expect(config.agentInstructions?.join("\n")).toContain(
      "do not also list social-post, newsletter, deck, or other draft entity types",
    );
  });

  it("treats semantic content search results as candidates", () => {
    const config = resolve(rover, {}, { preset: "full" });

    expect(config.agentInstructions?.join("\n")).toContain(
      "use semantic search results as candidates, not proof",
    );
    expect(config.agentInstructions?.join("\n")).toContain(
      "omit weak/tangential candidates",
    );
    expect(config.agentInstructions?.join("\n")).toContain(
      "only an isolated shared term or pattern",
    );
    expect(config.agentInstructions?.join("\n")).toContain(
      "list only the strongest clear match",
    );
  });

  it("treats make-one-draft follow-ups as ambiguous after an empty draft list", () => {
    const config = resolve(rover, {}, { preset: "full" });

    expect(config.agentInstructions?.join("\n")).toContain(
      "After telling the user there are no draft blog posts",
    );
    expect(config.agentInstructions?.join("\n")).toContain(
      "do not offer to create a brand-new post",
    );
    expect(config.agentInstructions?.join("\n")).toContain(
      "do not call system_generate to create a fresh draft",
    );
  });

  it("includes document support in the core preset", () => {
    const config = resolve(rover, {}, { preset: "core" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("document");
  });

  it("keeps Rover onboarding disabled by default", () => {
    const config = resolve(rover, {}, { preset: "core" });
    const onboarding = config.plugins?.find(
      (plugin) => plugin.id === "rover-onboarding",
    );

    expect(onboarding?.config).toMatchObject({ enabled: false });
  });

  it("allows brain.yaml to opt into Rover onboarding", () => {
    const overrides = parseInstanceOverrides(`brain: rover
preset: core
plugins:
  rover-onboarding:
    enabled: true
`);
    const config = resolve(rover, {}, overrides);
    const onboarding = config.plugins?.find(
      (plugin) => plugin.id === "rover-onboarding",
    );

    expect(onboarding?.config).toMatchObject({ enabled: true });
  });

  it("registers the CMS editor with no login configuration", () => {
    const config = resolve(rover, {}, { preset: "full" });
    const cms = config.plugins?.find((plugin) => plugin.id === "cms");

    // The first-party editor authenticates via the operator session; the
    // browser never receives a repository credential.
    expect(cms).toBeDefined();
    expect(cms?.config).not.toHaveProperty("passkeyLogin");
  });
});
