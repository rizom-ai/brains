import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { IdentityService } from "@brains/identity-service";
import { ProfileService } from "@brains/profile-service";

/**
 * Tests for correct startup initialization order.
 *
 * The problem:
 * - Identity and profile services create default entities if DB is empty
 * - If this happens BEFORE git-sync pulls from remote, defaults overwrite remote data
 *
 * The correct order:
 * 1. Shell starts, services are created (but NOT initialized)
 * 2. system:plugins:ready emitted
 * 3. git-sync pulls from remote
 * 4. directory-sync imports files to DB
 * 5. sync:initial:completed emitted
 * 6. THEN identity/profile services initialize (creating defaults only if still empty)
 *
 * The bug:
 * - Shell was calling .initialize() BEFORE system:plugins:ready
 * - This created defaults before git-sync could pull remote data
 */
describe("Startup Initialization Order", () => {
  beforeEach(() => {
    IdentityService.resetInstance();
    ProfileService.resetInstance();
  });

  afterEach(() => {
    IdentityService.resetInstance();
    ProfileService.resetInstance();
  });

  describe("ShellInitializer must subscribe to sync:initial:completed", () => {
    it("should have a sync:initial:completed subscription in shellInitializer.ts", () => {
      // Read the source file and verify it subscribes to sync:initial:completed
      const shellInitializerPath = join(
        __dirname,
        "../src/initialization/shellInitializer.ts",
      );
      const source = readFileSync(shellInitializerPath, "utf-8");

      // The fix requires subscribing to sync:initial:completed
      // and calling identityService.initialize() and profileService.initialize() in that handler
      expect(source).toContain("subscribe");
      expect(source).toContain('"sync:initial:completed"');
    });

    it("should call initialize() on identity and profile services in sync:initial:completed handler", () => {
      const shellInitializerPath = join(
        __dirname,
        "../src/initialization/shellInitializer.ts",
      );
      const source = readFileSync(shellInitializerPath, "utf-8");

      // Find the sync:initial:completed subscription and following code block
      const syncCompletedIndex = source.indexOf('"sync:initial:completed"');
      expect(syncCompletedIndex).toBeGreaterThan(-1);

      // Get the next ~500 chars after sync:initial:completed to find the handler
      const handlerBlock = source.slice(
        syncCompletedIndex,
        syncCompletedIndex + 500,
      );

      // The handler should initialize both services
      expect(handlerBlock).toContain("identityService.initialize()");
      expect(handlerBlock).toContain("profileService.initialize()");
    });
  });

  describe("Shell.initialize must NOT call service.initialize() directly", () => {
    it("should NOT have identityService.initialize() or profileService.initialize() calls in shell.ts initialize method", () => {
      // Read shell.ts and verify the initialize() method doesn't call service.initialize()
      const shellPath = join(__dirname, "../src/shell.ts");
      const source = readFileSync(shellPath, "utf-8");

      // Extract the initialize() method
      const initMethodMatch = source.match(
        /public async initialize\(\)[^{]*\{([\s\S]*?)^\s{2}\}/m,
      );

      expect(initMethodMatch).not.toBeNull();

      if (initMethodMatch) {
        const initMethodBody = initMethodMatch[1];
        // These calls should NOT be in the initialize method - they should be in sync:initial:completed handler
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
