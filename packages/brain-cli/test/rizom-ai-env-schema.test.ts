import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const envSchemaPath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "apps",
  "rizom-ai",
  ".env.schema",
);

describe("rizom-ai env schema", () => {
  it("requires explicit Hetzner server type and location", () => {
    const envSchema = readFileSync(envSchemaPath, "utf-8");

    expect(envSchema).toContain("HCLOUD_SERVER_TYPE=");
    expect(envSchema).toContain("HCLOUD_LOCATION=");
  });
});
