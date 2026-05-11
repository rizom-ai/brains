import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BrainCharacterService,
  AnchorProfileService,
  CanonicalIdentityService,
} from "@brains/identity-service";

describe("Startup Initialization Order", () => {
  beforeEach(() => {
    BrainCharacterService.resetInstance();
    AnchorProfileService.resetInstance();
    CanonicalIdentityService.resetInstance();
  });

  afterEach(() => {
    BrainCharacterService.resetInstance();
    AnchorProfileService.resetInstance();
    CanonicalIdentityService.resetInstance();
  });

  describe("ShellInitializer must not own ready-state identity initialization", () => {
    const shellInitializerPath = join(
      __dirname,
      "../src/initialization/shellInitializer.ts",
    );

    it("should not subscribe to sync:initial:completed for identity/profile initialization", () => {
      const source = readFileSync(shellInitializerPath, "utf-8");

      expect(source).not.toContain('"sync:initial:completed"');
      expect(source).not.toContain("identityService.initialize()");
      expect(source).not.toContain("profileService.initialize()");
    });
  });

  describe("ShellBootloader must prepare ready-state identity before ready hooks", () => {
    const shellBootloaderPath = join(
      __dirname,
      "../src/initialization/shellBootloader.ts",
    );

    it("should initialize identity services after plugins-registered sync and before plugin ready hooks", () => {
      const source = readFileSync(shellBootloaderPath, "utf-8");

      const earlyWebserverCallIndex = source.indexOf(
        "this.startEarlyWebserver()",
      );
      const pluginsRegisteredCallIndex = source.indexOf(
        "this.emitPluginsRegistered()",
      );
      const prepareCallIndex = source.indexOf("this.prepareReadyState()");
      const readyCallIndex = source.indexOf("pluginManager.readyPlugins()");

      expect(source).toContain("identityService.initialize()");
      expect(source).toContain("profileService.initialize()");
      expect(source).toContain("canonicalIdentityService.refreshCache()");
      expect(source).not.toContain(
        "Promise.all([this.emitPluginsRegistered(), this.prepareReadyState()])",
      );
      expect(earlyWebserverCallIndex).toBeGreaterThan(-1);
      expect(pluginsRegisteredCallIndex).toBeGreaterThan(-1);
      expect(prepareCallIndex).toBeGreaterThan(-1);
      expect(readyCallIndex).toBeGreaterThan(-1);
      expect(earlyWebserverCallIndex).toBeLessThan(pluginsRegisteredCallIndex);
      expect(pluginsRegisteredCallIndex).toBeLessThan(prepareCallIndex);
      expect(prepareCallIndex).toBeLessThan(readyCallIndex);
    });
  });

  describe("Shell.initialize must NOT call service.initialize() directly", () => {
    it("should NOT have identityService.initialize() or profileService.initialize() calls in shell.ts initialize method", () => {
      const shellPath = join(__dirname, "../src/shell.ts");
      const source = readFileSync(shellPath, "utf-8");

      const initMethodMatch = source.match(
        /public async initialize\([^)]*\)[^{]*\{([\s\S]*?)^\s{2}\}/m,
      );
      expect(initMethodMatch).not.toBeNull();

      if (initMethodMatch) {
        const initMethodBody = initMethodMatch[1];
        expect(initMethodBody).not.toContain(
          "this.identityService.initialize()",
        );
        expect(initMethodBody).not.toContain(
          "this.profileService.initialize()",
        );
      }
    });
  });
});
