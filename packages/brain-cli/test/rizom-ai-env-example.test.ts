import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const envExamplePath = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "apps",
  "rizom-ai",
  ".env.example",
);

describe("rizom-ai env example", () => {
  it("does not require SERVER_IP because provisioning sets it", () => {
    const envExample = readFileSync(envExamplePath, "utf-8");

    expect(envExample).not.toContain("SERVER_IP=");
    expect(envExample).toContain("HCLOUD_TOKEN=");
    expect(envExample).toContain("HCLOUD_SSH_KEY_NAME=");
    expect(envExample).toContain("KAMAL_SSH_PRIVATE_KEY=");
  });
});
