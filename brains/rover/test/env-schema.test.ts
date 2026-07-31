import { describe, it, expect } from "bun:test";
import { roverEnvSchema } from "../src/env-schema";

// Every env var a brain.yaml can interpolate must be declared in the
// composed schema, or it never reaches env.schema.template and
// `brain secrets push` — the operator finds out via a silent runtime skip.
describe("rover env schema", () => {
  it("declares the Slack chat-adapter secrets", () => {
    const names = roverEnvSchema.map((decl) => decl.name);
    expect(names).toContain("SLACK_BOT_TOKEN");
    expect(names).toContain("SLACK_APP_TOKEN");
  });

  it("marks the Slack secrets sensitive", () => {
    const slackDecls = roverEnvSchema.filter((decl) =>
      decl.name.startsWith("SLACK_"),
    );
    expect(slackDecls.length).toBeGreaterThan(0);
    for (const decl of slackDecls) {
      expect(decl.sensitive).toBe(true);
    }
  });

  it("declares no duplicate env vars", () => {
    const names = roverEnvSchema.map((decl) => decl.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
