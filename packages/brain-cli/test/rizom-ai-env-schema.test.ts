import { describe, expect, it } from "bun:test";
import { buildInstanceEnvSchema } from "../src/lib/env-schema";

describe("rizom-ai env schema", () => {
  it("requires explicit Hetzner server type and location", () => {
    const envSchema = buildInstanceEnvSchema("ranger", "rizom-ai");

    expect(envSchema).toContain("HCLOUD_SERVER_TYPE=");
    expect(envSchema).toContain("HCLOUD_LOCATION=");
  });
});
