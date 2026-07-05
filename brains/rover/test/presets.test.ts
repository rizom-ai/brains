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
