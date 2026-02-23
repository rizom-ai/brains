import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  BrainCharacterService,
  AnchorProfileService,
} from "@brains/identity-service";

describe("Startup Initialization Order", () => {
  beforeEach(() => {
    BrainCharacterService.resetInstance();
    AnchorProfileService.resetInstance();
  });

  afterEach(() => {
    BrainCharacterService.resetInstance();
    AnchorProfileService.resetInstance();
  });

  describe("ShellInitializer must subscribe to sync:initial:completed", () => {
    const shellInitializerPath = join(
      __dirname,
      "../src/initialization/shellInitializer.ts",
    );

    it("should have a sync:initial:completed subscription in shellInitializer.ts", () => {
      const source = readFileSync(shellInitializerPath, "utf-8");

      expect(source).toContain("subscribe");
      expect(source).toContain('"sync:initial:completed"');
    });

    it("should call initialize() on identity and profile services in sync:initial:completed handler", () => {
      const source = readFileSync(shellInitializerPath, "utf-8");

      const syncCompletedIndex = source.indexOf('"sync:initial:completed"');
      expect(syncCompletedIndex).toBeGreaterThan(-1);

      const handlerBlock = source.slice(
        syncCompletedIndex,
        syncCompletedIndex + 500,
      );

      expect(handlerBlock).toContain("identityService.initialize()");
      expect(handlerBlock).toContain("profileService.initialize()");
    });
  });

  describe("Shell.initialize must NOT call service.initialize() directly", () => {
    it("should NOT have identityService.initialize() or profileService.initialize() calls in shell.ts initialize method", () => {
      const shellPath = join(__dirname, "../src/shell.ts");
      const source = readFileSync(shellPath, "utf-8");

      const initMethodMatch = source.match(
        /public async initialize\(\)[^{]*\{([\s\S]*?)^\s{2}\}/m,
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
