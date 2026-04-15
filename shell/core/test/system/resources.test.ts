import { describe, expect, it } from "bun:test";
import { createSystemResources } from "../../src/system/resources";
import { createMockSystemServices } from "./mock-services";

describe("system resources", () => {
  it("should create core system resources", () => {
    const resources = createSystemResources(createMockSystemServices());
    const uris = resources.map((r) => r.uri);

    expect(uris).toContain("entity://types");
    expect(uris).toContain("brain://identity");
    expect(uris).toContain("brain://profile");
    expect(uris).toContain("brain://status");
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
});
