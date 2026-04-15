import { describe, expect, it } from "bun:test";
import { fromYaml } from "@brains/utils";
import { createSystemResources } from "../../src/system/resources";
import { createMockSystemServices } from "./mock-services";

describe("system resources", () => {
  it("should create core system resources including cms config", () => {
    const resources = createSystemResources(createMockSystemServices());
    const uris = resources.map((r) => r.uri);

    expect(uris).toContain("entity://types");
    expect(uris).toContain("brain://identity");
    expect(uris).toContain("brain://profile");
    expect(uris).toContain("brain://status");
    expect(uris).toContain("brain://cms-config");
  });

  it("entity://types should return registered entity types", async () => {
    const services = createMockSystemServices();
    services.addEntities([
      {
        id: "p1",
        entityType: "post",
        content: "",
        contentHash: "",
        metadata: {},
        created: "",
        updated: "",
      },
    ]);
    const resources = createSystemResources(services);
    const typesResource = resources.find((r) => r.uri === "entity://types");
    const result = await typesResource?.handler();

    expect(result?.contents[0]?.text).toContain("post");
  });

  it("brain://identity should return identity as JSON", async () => {
    const resources = createSystemResources(createMockSystemServices());
    const resource = resources.find((r) => r.uri === "brain://identity");
    const result = await resource?.handler();
    const parsed = JSON.parse(result?.contents[0]?.text ?? "{}");

    expect(parsed.name).toBe("Test Brain");
  });

  it("brain://profile should return profile as JSON", async () => {
    const resources = createSystemResources(createMockSystemServices());
    const resource = resources.find((r) => r.uri === "brain://profile");
    const result = await resource?.handler();
    const parsed = JSON.parse(result?.contents[0]?.text ?? "{}");

    expect(parsed.name).toBe("Test Owner");
  });

  it("brain://cms-config should return yaml cms config", async () => {
    const services = createMockSystemServices({
      siteBaseUrl: "yeehaa.io",
      entityDisplay: {
        post: { label: "Essay" },
      },
    });
    services.addEntities([
      {
        id: "p1",
        entityType: "post",
        content: "",
        contentHash: "",
        metadata: {},
        created: "",
        updated: "",
      },
    ]);

    const resources = createSystemResources(services);
    const resource = resources.find((r) => r.uri === "brain://cms-config");
    const result = await resource?.handler();
    const parsed = fromYaml<{
      backend: { repo: string; branch: string; base_url?: string };
      collections: Array<{ name: string; label: string }>;
    }>(result?.contents[0]?.text ?? "");

    expect(result?.contents[0]?.mimeType).toBe("text/yaml");
    expect(parsed.backend.repo).toBe("owner/repo");
    expect(parsed.backend.branch).toBe("main");
    expect(parsed.backend.base_url).toBe("https://yeehaa.io");
    expect(
      parsed.collections.some(
        (collection) =>
          collection.name === "post" && collection.label === "Essays",
      ),
    ).toBe(true);
  });
});
