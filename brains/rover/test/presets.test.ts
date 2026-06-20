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

  it("includes document support in the core preset", () => {
    const config = resolve(rover, {}, { preset: "core" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("document");
  });

  it("keeps onboarding playbook starters disabled by default", () => {
    const config = resolve(rover, {}, { preset: "core" });
    const playbooks = config.plugins?.find(
      (plugin) => plugin.id === "playbooks",
    );

    expect(playbooks?.config).toMatchObject({ lifecycle: {}, triggers: {} });
  });

  it("allows brain.yaml to opt into onboarding playbook starters", () => {
    const overrides = parseInstanceOverrides(`brain: rover
preset: core
plugins:
  playbooks:
    triggers:
      first-anchor-web-chat: true
`);
    const config = resolve(rover, {}, overrides);
    const playbooks = config.plugins?.find(
      (plugin) => plugin.id === "playbooks",
    );

    expect(playbooks?.config).toMatchObject({
      triggers: { "first-anchor-web-chat": true },
    });
  });

  it("wires CMS passkey login from CMS_CONTENT_REPO_PAT when present", () => {
    const config = resolve(
      rover,
      { CMS_CONTENT_REPO_PAT: "cms-pat" },
      { preset: "full" },
    );
    const cms = config.plugins?.find((plugin) => plugin.id === "cms");

    expect(cms?.config).toMatchObject({
      passkeyLogin: { contentRepoToken: "cms-pat" },
    });
  });

  it("keeps CMS login disabled when CMS_CONTENT_REPO_PAT is absent", () => {
    const config = resolve(rover, {}, { preset: "full" });
    const cms = config.plugins?.find((plugin) => plugin.id === "cms");

    expect(cms?.config).not.toHaveProperty("passkeyLogin");
  });
});
