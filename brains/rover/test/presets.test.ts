import { describe, expect, it } from "bun:test";
import { resolve } from "@brains/app";
import rover from "../src";

describe("rover presets", () => {
  it("includes ATProto in the core preset", () => {
    const config = resolve(rover, {}, { preset: "core" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("atproto");
  });

  it("includes document support in the full preset", () => {
    const config = resolve(rover, {}, { preset: "full" });
    const pluginIds = config.plugins?.map((plugin) => plugin.id) ?? [];

    expect(pluginIds).toContain("document");
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
