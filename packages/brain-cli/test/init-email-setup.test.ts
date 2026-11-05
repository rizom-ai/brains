import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseInstanceOverrides,
  resolve,
  type AppConfig,
  type InstanceOverrides,
} from "@brains/app";
import { isRecord } from "@brains/utils/is-record";
import { scaffold } from "../src/commands/init";
import { canonicalBrain } from "../src/model/canonical-brain";

const SETUP_EMAIL_VARS = [
  "SETUP_EMAIL_TO",
  "SETUP_EMAIL_API_KEY",
  "SETUP_EMAIL_FROM",
] as const;

const EMAIL_RECIPES = ["personal", "professional", "team"] as const;

function runtimeOverrides(
  overrides: InstanceOverrides,
): Omit<InstanceOverrides, "brain"> {
  // Site packages are resolved at boot; this test is about plugin config.
  const { brain: _brain, site: _site, ...runtime } = overrides;
  return runtime;
}

function pluginConfig(
  resolved: AppConfig,
  id: string,
): Record<string, unknown> | undefined {
  const plugin = resolved.plugins?.find((candidate) => candidate.id === id);
  if (!plugin || !("config" in plugin)) return undefined;
  return isRecord(plugin.config) ? plugin.config : undefined;
}

describe("scaffolded email setup", () => {
  let testDir: string;
  const savedEnv: Partial<Record<string, string>> = {};

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "brain-init-email-"));
    for (const name of SETUP_EMAIL_VARS) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    for (const name of SETUP_EMAIL_VARS) {
      const value = savedEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  function scaffoldAndResolve(
    recipe: (typeof EMAIL_RECIPES)[number],
  ): AppConfig {
    const dir = join(testDir, recipe);
    scaffold(dir, { recipe });
    const overrides = parseInstanceOverrides(
      readFileSync(join(dir, "brain.yaml"), "utf8"),
    );
    return resolve(canonicalBrain, {}, runtimeOverrides(overrides));
  }

  it("keeps the headless recipe free of email setup", () => {
    scaffold(testDir, { recipe: "headless" });

    const yaml = readFileSync(join(testDir, "brain.yaml"), "utf-8");
    expect(yaml).not.toContain("SETUP_EMAIL_");
  });

  for (const recipe of EMAIL_RECIPES) {
    it(`wires ${recipe} setup and invitation email through SETUP_EMAIL_*`, () => {
      const dir = join(testDir, recipe);
      scaffold(dir, { recipe });

      const yaml = readFileSync(join(dir, "brain.yaml"), "utf-8");
      expect(yaml).toContain("setupEmail: ${SETUP_EMAIL_TO}");
      expect(yaml).toContain("address: ${SETUP_EMAIL_TO}");
      expect(yaml).toContain("transport: resend");
      expect(yaml).toContain("apiKey: ${SETUP_EMAIL_API_KEY}");
      expect(yaml).toContain("from: ${SETUP_EMAIL_FROM}");
    });

    it(`resolves a ${recipe} brain with the SETUP_EMAIL_* variables unset`, () => {
      const resolved = scaffoldAndResolve(recipe);

      const notifications = pluginConfig(resolved, "notifications");
      const auth = pluginConfig(resolved, "auth-service");
      const email = pluginConfig(resolved, "email");
      expect(notifications).toBeDefined();
      expect(notifications?.["defaultRecipient"]).toBeUndefined();
      expect(auth).toBeDefined();
      expect(auth?.["setupEmail"]).toBeUndefined();
      expect(email).toMatchObject({ transport: "resend" });
      expect(email?.["apiKey"]).toBeUndefined();
      expect(email?.["from"]).toBeUndefined();
    });

    it(`resolves a ${recipe} brain with the SETUP_EMAIL_* variables set`, () => {
      process.env["SETUP_EMAIL_TO"] = "owner@example.com";
      process.env["SETUP_EMAIL_API_KEY"] = "re_test";
      process.env["SETUP_EMAIL_FROM"] = "Brain <brain@example.com>";

      const resolved = scaffoldAndResolve(recipe);

      expect(pluginConfig(resolved, "notifications")).toMatchObject({
        defaultRecipient: { type: "email", address: "owner@example.com" },
      });
      expect(pluginConfig(resolved, "auth-service")).toMatchObject({
        setupEmail: "owner@example.com",
      });
      expect(pluginConfig(resolved, "email")).toMatchObject({
        transport: "resend",
        apiKey: "re_test",
        from: "Brain <brain@example.com>",
      });
    });
  }
});
