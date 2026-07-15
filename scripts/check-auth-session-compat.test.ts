import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findDeprecatedAuthSessionConsumers,
  isLegacyCookieRemovalEligible,
  stampCompatibilityRelease,
} from "./check-auth-session-compat";

describe("auth-session compatibility gate", () => {
  it("finds deprecated session API use outside compatibility definitions", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-session-compat-"));
    try {
      await mkdir(join(root, "shell/auth-service/src"), { recursive: true });
      await mkdir(join(root, "plugins/example/src"), { recursive: true });
      await writeFile(
        join(root, "shell/auth-service/src/session-store.ts"),
        "export const LEGACY_OPERATOR_SESSION_COOKIE = 'brains_operator_session';",
      );
      await writeFile(
        join(root, "plugins/example/src/plugin.ts"),
        "service.getOperatorSession(request);",
      );

      expect(await findDeprecatedAuthSessionConsumers(root)).toEqual([
        "plugins/example/src/plugin.ts:1:getOperatorSession",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stamps the first release that issues the new cookie", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-session-release-"));
    try {
      const metadataPath = join(root, "compat.json");
      const packagePath = join(root, "package.json");
      await writeFile(
        metadataPath,
        JSON.stringify({
          newCookieIntroducedIn: "unreleased",
          minimumSupportedUpgradeVersion: null,
        }),
      );
      await writeFile(packagePath, JSON.stringify({ version: "0.3.0" }));

      expect(await stampCompatibilityRelease(metadataPath, packagePath)).toBe(
        true,
      );
      expect(JSON.parse(await Bun.file(metadataPath).text())).toEqual({
        newCookieIntroducedIn: "0.3.0",
        minimumSupportedUpgradeVersion: null,
      });
      expect(await stampCompatibilityRelease(metadataPath, packagePath)).toBe(
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires released introduction and minimum-upgrade versions", () => {
    expect(
      isLegacyCookieRemovalEligible({
        newCookieIntroducedIn: "unreleased",
        minimumSupportedUpgradeVersion: null,
      }),
    ).toBe(false);
    expect(
      isLegacyCookieRemovalEligible({
        newCookieIntroducedIn: "0.3.0",
        minimumSupportedUpgradeVersion: "0.2.9",
      }),
    ).toBe(false);
    expect(
      isLegacyCookieRemovalEligible({
        newCookieIntroducedIn: "0.3.0",
        minimumSupportedUpgradeVersion: "0.3.0",
      }),
    ).toBe(true);
  });
});
