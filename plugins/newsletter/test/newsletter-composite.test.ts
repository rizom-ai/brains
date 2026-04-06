import { describe, expect, test } from "bun:test";
import { newsletter } from "../src";

describe("newsletter composite", () => {
  test("returns both the newsletter entity plugin and the buttondown service plugin", () => {
    const plugins = newsletter({});
    expect(plugins).toHaveLength(2);
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain("newsletter");
    expect(ids).toContain("buttondown");
  });

  test("works with empty config", () => {
    const plugins = newsletter();
    expect(plugins).toHaveLength(2);
  });

  test("the newsletter entity plugin has type 'entity'", () => {
    const plugins = newsletter();
    const entity = plugins.find((p) => p.id === "newsletter");
    expect(entity?.type).toBe("entity");
  });

  test("the buttondown service plugin has type 'service'", () => {
    const plugins = newsletter();
    const service = plugins.find((p) => p.id === "buttondown");
    expect(service?.type).toBe("service");
  });
});
