import { describe, expect, it } from "bun:test";
import { parseEnvSchema } from "../src/ci";

describe("parseEnvSchema", () => {
  it("extracts keys with required and sensitive annotations", () => {
    const content = `# @required @sensitive
AI_API_KEY=

# @sensitive
DISCORD_BOT_TOKEN=

PLAIN_VAR=
`;
    const entries = parseEnvSchema(content);
    expect(entries).toEqual([
      { key: "AI_API_KEY", required: true, sensitive: true },
      { key: "DISCORD_BOT_TOKEN", required: false, sensitive: true },
      { key: "PLAIN_VAR", required: false, sensitive: false },
    ]);
  });

  it("handles @required without @sensitive", () => {
    const content = `# @required
HCLOUD_SSH_KEY_NAME=
`;
    const entries = parseEnvSchema(content);
    expect(entries).toEqual([
      { key: "HCLOUD_SSH_KEY_NAME", required: true, sensitive: false },
    ]);
  });

  it("skips duplicate keys", () => {
    const content = `FOO=
FOO=
BAR=
`;
    expect(parseEnvSchema(content).map((e) => e.key)).toEqual(["FOO", "BAR"]);
  });

  it("ignores non-key lines", () => {
    const content = `# just a comment
some random text
FOO=bar
`;
    expect(parseEnvSchema(content)).toEqual([
      { key: "FOO", required: false, sensitive: false },
    ]);
  });

  it("resets annotation state after a non-key line", () => {
    const content = `# @required
some text that is not a key

AFTER_RESET=
`;
    expect(parseEnvSchema(content)).toEqual([
      { key: "AFTER_RESET", required: false, sensitive: false },
    ]);
  });

  it("parses a realistic env schema", () => {
    const content = `# @defaultRequired=false @defaultSensitive=false
# ----------

# AI provider
# @required @sensitive
AI_API_KEY=

# @sensitive
AI_IMAGE_KEY=

# Git sync
# @required @sensitive
GIT_SYNC_TOKEN=

# Interfaces
# @sensitive
MCP_AUTH_TOKEN=

# @sensitive
DISCORD_BOT_TOKEN=

CLOUDFLARE_ANALYTICS_SITE_TAG=
`;
    const entries = parseEnvSchema(content);
    expect(entries.length).toBe(6);
    expect(entries.filter((e) => e.required).map((e) => e.key)).toEqual([
      "AI_API_KEY",
      "GIT_SYNC_TOKEN",
    ]);
    expect(entries.filter((e) => e.sensitive).map((e) => e.key)).toEqual([
      "AI_API_KEY",
      "AI_IMAGE_KEY",
      "GIT_SYNC_TOKEN",
      "MCP_AUTH_TOKEN",
      "DISCORD_BOT_TOKEN",
    ]);
  });
});
